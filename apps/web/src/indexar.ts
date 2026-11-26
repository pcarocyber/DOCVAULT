/**
 * Pone al día el índice con lo que hay en la carpeta: agrega lo nuevo,
 * vuelve a leer lo que cambió y quita lo que ya no está.
 */
import type { DocIndice, EstadoTexto, Indice } from "@docvault/indice";
import { configurarMotores, extraerTextoPdf } from "@docvault/core/navegador";
import { analizarVencimiento, detectarMovidos, extraerTextoDocx, extraerTextoXlsx, sha256, type DatosVence } from "@docvault/core";
import { asignarFaltantes, leerCodigosGuardados } from "./codigos";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { recorrer } from "./carpeta";

configurarMotores({ pdfWorker });

const TEXTO_PLANO = new Set(["txt", "md", "csv", "json", "xml", "html", "htm", "rtf"]);
/** Imágenes que el OCR sabe leer. HEIC (fotos del iPhone) todavía no: Chrome no las abre. */
const IMAGENES = new Set(["jpg", "jpeg", "png", "tif", "tiff", "webp", "bmp", "gif"]);
const MAX_TEXTO = 1_000_000;

export interface Avance { fase: "buscando" | "leyendo" | "completando" | "guardando"; hechos: number; total: number; actual?: string }
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

/** La fecha de vencimiento de un texto ya leído; null si el texto todavía no está (espera OCR). */
export function venceDe(texto: string, estado: EstadoTexto): DatosVence | null {
  if (estado === "pendiente de OCR") return null;
  if (estado !== "listo") return { vence: null, venceEstado: "no detectada", venceTexto: null, venceOtra: null };
  return analizarVencimiento(texto);
}

/** La huella exacta (SHA-256) de un archivo; null si no se pudo leer. */
export async function hashDe(archivo: File): Promise<string | null> {
  try { return await sha256(await archivo.arrayBuffer()); } catch { return null; }
}

/** La ficha del índice para un archivo de la carpeta. */
export function fichaDe(
  ruta: string, archivo: File, texto: string, estado: EstadoTexto, confianza?: number | null, codigo?: string | null,
  hash?: string | null, vence?: DatosVence | null,
): DocIndice {
  const sub = ruta.includes("/") ? ruta.slice(0, ruta.lastIndexOf("/")) : null;
  return {
    id: ruta, ruta, titulo: ruta, texto, carpeta: sub ?? undefined,
    tamano: archivo.size, modificado: archivo.lastModified, tipo: extension(archivo.name), estadoTexto: estado,
    confianza: confianza ?? undefined, codigo: codigo ?? undefined, hash: hash ?? undefined,
    ...(vence ?? venceDe(texto, estado) ?? {}),
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
      // Movido sin cambios: se conserva todo, también la fecha que decidió el usuario.
      const t = textoMovido.get(previo.id) ?? "";
      const vence = previo.venceEstado
        ? { vence: previo.vence, venceEstado: previo.venceEstado, venceTexto: previo.venceTexto, venceOtra: previo.venceOtra }
        : null;
      lote.push(fichaDe(a.ruta, archivo, t, previo.estadoTexto, previo.confianza, previo.codigo, previo.hash ?? (await hashDe(archivo)), vence));
    } else {
      const { texto, estado } = await leerTexto(archivo);
      if (estado === "error") errores++;
      lote.push(fichaDe(a.ruta, archivo, texto, estado, null, antes?.codigo, await hashDe(archivo)));
    }
    if (lote.length >= 25) indice.agregar(lote.splice(0));
  }
  if (lote.length) indice.agregar(lote);

  // Índices de la entrega 3 o anteriores: completar huella y vencimiento sin releer el texto.
  const leidos = new Set(porLeer.map((a) => a.ruta));
  const incompletos = indice.listar().filter((d) => !leidos.has(d.id) && (!d.hash || (!d.venceEstado && d.estadoTexto !== "pendiente de OCR")));
  const porRuta = new Map(archivos.map((a) => [a.ruta, a]));
  for (const [i, d] of incompletos.entries()) {
    alAvanzar({ fase: "completando", hechos: i, total: incompletos.length, actual: d.id });
    if (!d.venceEstado && d.estadoTexto) {
      const v = venceDe(indice.texto(d.id) ?? "", d.estadoTexto);
      if (v) indice.ponerVencimiento(d.id, v);
    }
    const a = porRuta.get(d.id);
    if (!d.hash && a) {
      try { const h = await hashDe(await a.handle.getFile()); if (h) indice.ponerHash(d.id, h); } catch { /* se intenta la próxima vez */ }
    }
  }
  alAvanzar({ fase: "guardando", hechos: porLeer.length, total: porLeer.length });
  const codigosNuevos = asignarFaltantes(indice, await leerCodigosGuardados(raiz));

  const nuevos = porLeer.filter((a) => !previos.has(a.ruta)).length;
  return {
    nuevos: nuevos - movidos.size, movidos: movidos.size, actualizados: porLeer.length - nuevos,
    quitados: quitados.length - movidos.size, sinCambios: archivos.length - porLeer.length, errores,
    codigosNuevos, segundos: (performance.now() - t0) / 1000,
  };
}
