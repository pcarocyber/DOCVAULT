/**
 * Pone al día el índice con lo que hay en la carpeta: agrega lo nuevo,
 * vuelve a leer lo que cambió y quita lo que ya no está.
 */
import type { DocIndice, EstadoTexto, Indice } from "@docvault/indice";
import { configurarMotores, extraerTextoPdf } from "@docvault/core/navegador";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { recorrer, type ArchivoEncontrado } from "./carpeta";

configurarMotores({ pdfWorker });

const TEXTO_PLANO = new Set(["txt", "md", "csv", "json", "xml", "html", "htm", "rtf"]);
const IMAGENES = new Set(["jpg", "jpeg", "png", "tif", "tiff", "webp", "heic", "bmp", "gif"]);
const MAX_TEXTO = 1_000_000;

export interface Avance { fase: "buscando" | "leyendo" | "guardando"; hechos: number; total: number; actual?: string }
export interface ResumenIndexado { nuevos: number; actualizados: number; quitados: number; sinCambios: number; errores: number; segundos: number }

export function extension(nombre: string): string {
  const i = nombre.lastIndexOf(".");
  return i > 0 ? nombre.slice(i + 1).toLowerCase() : "";
}

async function leerTexto(a: ArchivoEncontrado): Promise<{ texto: string; estado: EstadoTexto }> {
  const ext = extension(a.nombre);
  try {
    if (ext === "pdf") {
      const bytes = new Uint8Array(await (await a.handle.getFile()).arrayBuffer());
      const r = await extraerTextoPdf(bytes);
      return r.texto.replace(/\s/g, "").length >= 40
        ? { texto: r.texto.slice(0, MAX_TEXTO), estado: "listo" }
        : { texto: r.texto, estado: "pendiente de OCR" };
    }
    if (TEXTO_PLANO.has(ext)) {
      const t = await (await a.handle.getFile()).slice(0, MAX_TEXTO).text();
      return { texto: t, estado: t.trim() ? "listo" : "sin texto" };
    }
    if (IMAGENES.has(ext)) return { texto: "", estado: "pendiente de OCR" };
    return { texto: "", estado: "formato no soportado" };
  } catch {
    return { texto: "", estado: "error" };
  }
}

export async function actualizarIndice(
  raiz: FileSystemDirectoryHandle, indice: Indice, alAvanzar: (a: Avance) => void,
): Promise<ResumenIndexado> {
  const t0 = performance.now();
  alAvanzar({ fase: "buscando", hechos: 0, total: 0 });
  const archivos = await recorrer(raiz, (n) => alAvanzar({ fase: "buscando", hechos: n, total: 0 }));
  const previos = new Map(indice.listar().map((d) => [d.id, d]));
  const porLeer = archivos.filter((a) => {
    const p = previos.get(a.ruta);
    return !p || p.tamano !== a.tamano || p.modificado !== a.modificado;
  });
  const enCarpeta = new Set(archivos.map((a) => a.ruta));
  const quitados = [...previos.keys()].filter((id) => !enCarpeta.has(id));
  if (quitados.length) indice.quitar(quitados);

  let errores = 0;
  const lote: DocIndice[] = [];
  for (const [i, a] of porLeer.entries()) {
    alAvanzar({ fase: "leyendo", hechos: i, total: porLeer.length, actual: a.ruta });
    const { texto, estado } = await leerTexto(a);
    if (estado === "error") errores++;
    const sub = a.ruta.includes("/") ? a.ruta.slice(0, a.ruta.lastIndexOf("/")) : null;
    lote.push({
      id: a.ruta, ruta: a.ruta, titulo: a.ruta, texto, carpeta: sub ?? undefined,
      tamano: a.tamano, modificado: a.modificado, tipo: extension(a.nombre), estadoTexto: estado,
    });
    if (lote.length >= 25) indice.agregar(lote.splice(0));
  }
  if (lote.length) indice.agregar(lote);
  alAvanzar({ fase: "guardando", hechos: porLeer.length, total: porLeer.length });

  const nuevos = porLeer.filter((a) => !previos.has(a.ruta)).length;
  return {
    nuevos, actualizados: porLeer.length - nuevos, quitados: quitados.length,
    sinCambios: archivos.length - porLeer.length, errores, segundos: (performance.now() - t0) / 1000,
  };
}
