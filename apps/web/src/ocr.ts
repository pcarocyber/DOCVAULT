/**
 * Cola de OCR: lee, uno por uno, las fotos y los PDF escaneados que quedaron
 * "pendiente de OCR". Tesseract corre en un worker aparte, así que la app sigue
 * respondiendo mientras tanto. La cola se puede detener (al cambiar de carpeta).
 */
import type { Indice } from "@docvault/indice";
import { MotorOcr, configurarMotores, pdfAImagenes } from "@docvault/core/navegador";
import { archivoPorRuta } from "./carpeta";

configurarMotores({
  tesseractWorker: new URL("/motores/tesseract/worker.min.js", location.href).href,
  tesseractCore: new URL("/motores/tesseract-core", location.href).href,
  tesseractIdiomas: new URL("/motores/tessdata", location.href).href,
});

/** Por debajo de esta confianza el texto se marca "revisar". */
export const CONFIANZA_MINIMA = 0.7;
/** Más páginas que esto en un PDF escaneado: se leen solo las primeras. */
const MAX_PAGINAS = 30;
/** Cada cuántos documentos se guarda el índice en disco. */
const GUARDAR_CADA = 5;

export interface AvanceOcr { hechos: number; total: number; actual: string }
export interface ResumenOcr { leidos: number; dudosos: number; vacios: number; errores: number; segundos: number; detenido: boolean }

export class ColaOcr {
  private detener = false;
  private motor: MotorOcr | null = null;

  /** Para la cola después del documento que está leyendo. */
  parar(): void { this.detener = true; }

  async correr(
    raiz: FileSystemDirectoryHandle, indice: Indice,
    alAvanzar: (a: AvanceOcr) => void, guardar: () => Promise<void>,
  ): Promise<ResumenOcr> {
    const t0 = performance.now();
    const pendientes = indice.listar().filter((d) => d.estadoTexto === "pendiente de OCR");
    const r: ResumenOcr = { leidos: 0, dudosos: 0, vacios: 0, errores: 0, segundos: 0, detenido: false };
    if (pendientes.length === 0) return r;
    try {
      for (const [i, doc] of pendientes.entries()) {
        if (this.detener) { r.detenido = true; break; }
        alAvanzar({ hechos: i, total: pendientes.length, actual: doc.id });
        try {
          this.motor ??= await MotorOcr.crear(["spa", "eng"]);
          const archivo = await archivoPorRuta(raiz, doc.id);
          const l = await leerConOcr(this.motor, archivo, doc.tipo ?? "");
          indice.ponerTexto(doc.id, l.texto, l.estado, l.confianza);
          if (l.estado === "sin texto") r.vacios++;
          else if (l.confianza != null && l.confianza < CONFIANZA_MINIMA) r.dudosos++;
          r.leidos++;
        } catch {
          indice.ponerTexto(doc.id, "", "error", null);
          r.errores++;
        }
        if ((i + 1) % GUARDAR_CADA === 0) await guardar();
      }
      await guardar();
    } finally {
      await this.motor?.terminar();
      this.motor = null;
    }
    r.segundos = (performance.now() - t0) / 1000;
    return r;
  }
}

/** Lee una foto o un PDF escaneado con OCR. Lanza error si la imagen está dañada. */
export async function leerConOcr(
  motor: MotorOcr, archivo: File, tipo: string,
): Promise<{ texto: string; estado: "listo" | "sin texto"; confianza: number | null }> {
  // Una imagen dañada hace fallar a Tesseract de forma ruidosa; mejor detectarla antes.
  // (Chrome no abre TIFF, pero Tesseract sí, así que esas pasan directo.)
  if (tipo !== "pdf" && tipo !== "tif" && tipo !== "tiff") (await createImageBitmap(archivo)).close();
  const imagenes = tipo === "pdf"
    ? await pdfAImagenes(new Uint8Array(await archivo.arrayBuffer()), 2.5, MAX_PAGINAS)
    : [archivo];
  const textos: string[] = [];
  let suma = 0;
  let letras = 0;
  for (const img of imagenes) {
    const res = await motor.reconocer(img);
    textos.push(res.texto.trim());
    // la confianza del documento pesa cada página por la cantidad de texto que tiene
    const n = res.texto.replace(/\s/g, "").length;
    suma += res.confianza * n;
    letras += n;
  }
  if (letras < 3) return { texto: "", estado: "sin texto", confianza: null };
  return { texto: textos.join("\n\n").trim(), estado: "listo", confianza: Math.round((suma / letras) * 100) / 100 };
}
