/**
 * Escanear un código con la cámara de la computadora. Usa el lector de códigos
 * del propio Chrome (BarcodeDetector, que lee QR y Code 128) cuando lo hay;
 * si no, jsQR (QR) y ZXing (código de barras). Nada sale del equipo: la imagen se analiza
 * en el navegador y no se guarda.
 */
import { useEffect, useRef, useState } from "react";
import { leerCodigo } from "@docvault/core";

interface Props {
  /** Devuelve true si el código es de un documento de esta bóveda. */
  alLeer: (codigo: string) => boolean;
  alCerrar: () => void;
}

interface Detector { detect(fuente: CanvasImageSource): Promise<{ rawValue: string }[]> }

type Detectar = (v: HTMLVideoElement, c: HTMLCanvasElement) => Promise<string[]>;

/** Copia el cuadro actual del video a un lienzo (como mucho 1280 px de ancho) y devuelve sus píxeles. */
function cuadro(v: HTMLVideoElement, c: HTMLCanvasElement): ImageData | null {
  const ancho = Math.min(v.videoWidth, 1280);
  const alto = Math.round((v.videoHeight / v.videoWidth) * ancho);
  if (!ancho || !alto) return null;
  c.width = ancho; c.height = alto;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(v, 0, 0, ancho, alto);
  return ctx.getImageData(0, 0, ancho, alto);
}

/** Lector de respaldo: jsQR para el QR y ZXing para el código de barras (Code 128). */
async function detectorDeRespaldo(): Promise<Detectar> {
  const [{ default: jsQR }, zx] = await Promise.all([import("jsqr"), import("@zxing/library")]);
  const pistas = new Map<number, unknown>([
    [zx.DecodeHintType.POSSIBLE_FORMATS, [zx.BarcodeFormat.CODE_128, zx.BarcodeFormat.QR_CODE]],
    [zx.DecodeHintType.TRY_HARDER, true],
  ]);
  const lector = new zx.MultiFormatReader();
  lector.setHints(pistas);
  return async (v, c) => {
    const img = cuadro(v, c);
    if (!img) return [];
    const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
    if (qr?.data) return [qr.data];
    // ZXing trabaja con brillo (un número por píxel).
    const lum = new Uint8ClampedArray(img.width * img.height);
    for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (img.data[j]! * 77 + img.data[j + 1]! * 150 + img.data[j + 2]! * 29) >> 8;
    try {
      const fuente = new zx.RGBLuminanceSource(lum, img.width, img.height);
      return [lector.decodeWithState(new zx.BinaryBitmap(new zx.HybridBinarizer(fuente))).getText()];
    } catch { return []; }
    finally { lector.reset(); }
  };
}

/**
 * El lector de códigos del propio Chrome (BarcodeDetector) cuando lee QR y Code 128,
 * como en Mac; si no, el de respaldo. Siempre se leen los dos: QR y código de barras.
 */
async function crearDetector(): Promise<Detectar> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (BD) {
    try {
      const soportados = await BD.getSupportedFormats();
      if (soportados.includes("qr_code") && soportados.includes("code_128")) {
        const d = new BD({ formats: ["qr_code", "code_128"] });
        return async (v) => (await d.detect(v)).map((x) => x.rawValue);
      }
    } catch { /* se usa el de respaldo */ }
  }
  return detectorDeRespaldo();
}

export function Escanear({ alLeer, alCerrar }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [estado, setEstado] = useState<"iniciando" | "mirando" | "sin cámara" | "sin permiso">("iniciando");
  const [aviso, setAviso] = useState<string | null>(null);
  const alLeerRef = useRef(alLeer);
  alLeerRef.current = alLeer;

  useEffect(() => {
    let flujo: MediaStream | null = null;
    let vivo = true;
    let ultimo = "";
    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "environment" }, audio: false });
      } catch (e) {
        if (vivo) setEstado((e as DOMException).name === "NotAllowedError" ? "sin permiso" : "sin cámara");
        return;
      }
      if (!vivo) { flujo.getTracks().forEach((t) => t.stop()); return; }
      const v = video.current!;
      v.srcObject = flujo;
      await v.play().catch(() => {});
      const detectar = await crearDetector();
      if (!vivo) return;
      setEstado("mirando");
      while (vivo) {
        try {
          for (const texto of await detectar(v, lienzo.current!)) {
            const c = leerCodigo(texto);
            if (!c) { if (texto !== ultimo) setAviso(`Leí «${texto.slice(0, 40)}», pero no es un código de DOCVAULT.`); ultimo = texto; continue; }
            if (alLeerRef.current(c)) { vivo = false; return; }
            if (c !== ultimo) setAviso(`${c} no está en esta bóveda.`);
            ultimo = c;
          }
        } catch { /* un cuadro que no se pudo analizar: se sigue */ }
        await new Promise((ok) => setTimeout(ok, 180));
      }
    })();
    return () => { vivo = false; flujo?.getTracks().forEach((t) => t.stop()); };
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") alCerrar(); };
    addEventListener("keydown", tecla);
    return () => removeEventListener("keydown", tecla);
  }, [alCerrar]);

  return (
    <>
      <div className="velo" onClick={alCerrar} aria-hidden="true" />
      <div className="escanear" role="dialog" aria-modal="true" aria-label="Escanear código">
        <div className="comparar-cabeza">
          <div>
            <h2>Escanear un documento</h2>
            <p className="nota">Muestra a la cámara el QR o el código de barras impreso en el documento o en su etiqueta, a unos 20 o 30 cm y con luz. Si se ve borroso, aléjalo un poco.</p>
          </div>
          <button className="cerrar" onClick={alCerrar} aria-label="Cerrar el escáner">×</button>
        </div>
        <div className="visor">
          <video ref={video} muted playsInline />
          <div className="mira" aria-hidden="true" />
          {estado === "iniciando" && <p className="sobre-video">Abriendo la cámara…</p>}
          {estado === "sin permiso" && <p className="sobre-video">Chrome no tiene permiso para usar la cámara. Actívalo en el candado de la barra de direcciones y vuelve a intentarlo.</p>}
          {estado === "sin cámara" && <p className="sobre-video">No encontré una cámara en este equipo. Puedes usar un lector USB: escanea el código con la app abierta.</p>}
        </div>
        <canvas ref={lienzo} hidden />
        <p className="nota" role="status">{aviso ?? (estado === "mirando" ? "Buscando un código…" : "")}</p>
        <p className="nota">La imagen de la cámara se analiza aquí mismo y no se guarda ni se envía a ningún lado.</p>
      </div>
    </>
  );
}
