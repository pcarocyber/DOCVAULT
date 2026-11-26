/**
 * Escanear un código con la cámara de la computadora. Usa el lector de códigos
 * del propio Chrome (BarcodeDetector, que lee QR y Code 128) cuando lo hay;
 * si no, jsQR, que lee solo el QR. Nada sale del equipo: la imagen se analiza
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

async function crearDetector(): Promise<{ detectar: (v: HTMLVideoElement, c: HTMLCanvasElement) => Promise<string[]>; formatos: string }> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (BD) {
    try {
      const soportados = await BD.getSupportedFormats();
      const formatos = ["qr_code", "code_128"].filter((f) => soportados.includes(f));
      if (formatos.length) {
        const d = new BD({ formats: formatos });
        return { detectar: async (v) => (await d.detect(v)).map((x) => x.rawValue), formatos: formatos.includes("code_128") ? "QR o código de barras" : "QR" };
      }
    } catch { /* se usa jsQR */ }
  }
  const { default: jsQR } = await import("jsqr");
  return {
    formatos: "QR",
    detectar: async (v, c) => {
      const ancho = Math.min(v.videoWidth, 960);
      const alto = Math.round((v.videoHeight / v.videoWidth) * ancho);
      if (!ancho || !alto) return [];
      c.width = ancho; c.height = alto;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(v, 0, 0, ancho, alto);
      const r = jsQR(ctx.getImageData(0, 0, ancho, alto).data, ancho, alto, { inversionAttempts: "dontInvert" });
      return r ? [r.data] : [];
    },
  };
}

export function Escanear({ alLeer, alCerrar }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [estado, setEstado] = useState<"iniciando" | "mirando" | "sin cámara" | "sin permiso">("iniciando");
  const [formatos, setFormatos] = useState("QR");
  const [aviso, setAviso] = useState<string | null>(null);
  const alLeerRef = useRef(alLeer);
  alLeerRef.current = alLeer;

  useEffect(() => {
    let flujo: MediaStream | null = null;
    let vivo = true;
    let ultimo = "";
    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) {
        if (vivo) setEstado((e as DOMException).name === "NotAllowedError" ? "sin permiso" : "sin cámara");
        return;
      }
      if (!vivo) { flujo.getTracks().forEach((t) => t.stop()); return; }
      const v = video.current!;
      v.srcObject = flujo;
      await v.play().catch(() => {});
      const d = await crearDetector();
      if (!vivo) return;
      setFormatos(d.formatos);
      setEstado("mirando");
      while (vivo) {
        try {
          for (const texto of await d.detectar(v, lienzo.current!)) {
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
            <p className="nota">Muestra a la cámara el {formatos} impreso en el documento o en su etiqueta.</p>
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
