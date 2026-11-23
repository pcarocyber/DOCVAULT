/**
 * Pone al día el índice con lo que hay en la carpeta: agrega lo nuevo,
 * vuelve a leer lo que cambió y quita lo que ya no está.
 */
import type { DocIndice, EstadoTexto, Indice } from "@docvault/indice";
import { configurarMotores, extraerTextoPdf } from "@docvault/core/navegador";
import { detectarMovidos, extraerTextoDocx, extraerTextoXlsx } from "@docvault/core";
import { asignarFaltantes, leerCodigosGuardados } from "./codigos";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { recorrer } from "./carpeta";

configurarMotores({ pdfWorker });

const TEXTO_PLANO = new Set(["txt", "md", "csv", "json", "xml", "html", "htm", "rtf"]);
/** Imágenes que el OCR sabe leer. HEIC (fotos del iPhone) todavía no: Chrome no las abre. */
const IMAGENES = new Set(["jpg", "jpeg", "png", "tif", "tiff", "webp", "bmp", "gif"]);
const MAX_TEXTO = 1_000_000;

export interface Avance { fase: "buscando" | "leyendo" | "guardando"; hechos: number; total: number; actual?: string }
export interface ResumenIndexado {
  nuevos: number; movidos: number; actualizados: number; quitados: number; sinCambios: number;
  errores: number; codigosNuevos: number; segundos: number;
}

export function extension(nombre: string): string {
  const i = nombre.lastIndexOf(".");
  return i > 0 ? nombre.slice(i + 1).toLowerCase() : "";
}

/** Lee el texto de un archivo sin OCR. Las fotos y los PDF escaneados quedan "pendiente de OCR". */
export async function leerTexto(archivo: File): Promise<{ texto: string; estado: EstadoTexto }> {
  const ext = extension(archivo.name);
  try {
    if (ext === "pdf") {
      const r = await extraerTextoPdf(new Uint8Array(await archivo.arrayBuffer()));
      return r.texto.replace(/\s/g, "").length >= 40
        ? { texto: r.texto.slice(0, MAX_TEXTO), estado: "listo" }
        : { texto: r.texto, estado: "pendiente de OCR" };
    }
    if (TEXTO_PLANO.has(ext)) {
      const t = await archivo.slice(0, MAX_TEXTO).text();
      return { texto: t, estado: t.trim() ? "listo" : "sin texto" };
    }
    if (ext === "docx" || ext === "xlsx") {
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      const t = ext === "docx" ? extraerTextoDocx(bytes) : extraerTextoXlsx(bytes);
      return { texto: t, estado: t.trim() ? "listo" : "sin texto" };
    }
    if (IMAGENES.has(ext)) return { texto: "", estado: "pendiente de OCR" };
    return { texto: "", estado: "formato no soportado" };
  } catch {
    return { texto: "", estado: "error" };
  }
}

/** La ficha del índice para un archivo de la carpeta. */
export function fichaDe(
  ruta: string, archivo: File, texto: string, estado: EstadoTexto, confianza?: number | null, codigo?: string | null,
): DocIndice {
  const sub = ruta.includes("/") ? ruta.slice(0, ruta.lastIndexOf("/")) : null;
  return {
    id: ruta, ruta, titulo: ruta, texto, carpeta: sub ?? undefined,
    tamano: archivo.size, modificado: archivo.lastModified, tipo: extension(archivo.name), estadoTexto: estado,
    confianza: confianza ?? undefined, codigo: codigo ?? undefined,
  };
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
  const quitados = [...previos.values()].filter((d) => !enCarpeta.has(d.id));

  // Un archivo que se movió o se renombró fuera de la app conserva su código,
  // y si no cambió su contenido, también el texto ya leído (sin repetir el OCR).
  const movidos = detectarMovidos(
    porLeer.filter((a) => !previos.has(a.ruta)),
    quitados.map((d) => ({ ruta: d.id, nombre: d.id.split("/").at(-1)!, tamano: d.tamano ?? -1, modificado: d.modificado ?? -1, codigo: d.codigo })),
  );
  const textoMovido = new Map([...movidos].map(([, q]) => [q.ruta, indice.texto(q.ruta) ?? ""]));
  if (quitados.length) indice.quitar(quitados.map((d) => d.id));

  let errores = 0;
  const lote: DocIndice[] = [];
  for (const [i, a] of porLeer.entries()) {
    alAvanzar({ fase: "leyendo", hechos: i, total: porLeer.length, actual: a.ruta });
    let archivo: File;
    try { archivo = await a.handle.getFile(); } catch { errores++; continue; }
    const antes = movidos.get(a.ruta);
    const previo = antes ? previos.get(antes.ruta) : undefined;
    if (previo && previo.modificado === a.modificado && previo.estadoTexto) {
      lote.push(fichaDe(a.ruta, archivo, textoMovido.get(previo.id) ?? "", previo.estadoTexto, previo.confianza, previo.codigo));
    } else {
      const { texto, estado } = await leerTexto(archivo);
      if (estado === "error") errores++;
      lote.push(fichaDe(a.ruta, archivo, texto, estado, null, antes?.codigo));
    }
    if (lote.length >= 25) indice.agregar(lote.splice(0));
  }
  if (lote.length) indice.agregar(lote);
  alAvanzar({ fase: "guardando", hechos: porLeer.length, total: porLeer.length });
  const codigosNuevos = asignarFaltantes(indice, await leerCodigosGuardados(raiz));

  const nuevos = porLeer.filter((a) => !previos.has(a.ruta)).length;
  return {
    nuevos: nuevos - movidos.size, movidos: movidos.size, actualizados: porLeer.length - nuevos,
    quitados: quitados.length - movidos.size, sinCambios: archivos.length - porLeer.length, errores,
    codigosNuevos, segundos: (performance.now() - t0) / 1000,
  };
}
