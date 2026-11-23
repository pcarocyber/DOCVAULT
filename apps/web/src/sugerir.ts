/**
 * Sugerir la carpeta de un documento con la IA básica: un modelo pequeño de
 * embeddings (multilingual-e5-small) que corre en el navegador. Si existe la copia
 * local del banco (bench/modelos) se usa esa; si no, la primera vez se descarga de
 * Hugging Face (unos 120 MB) y Chrome lo guarda. Los documentos nunca salen del equipo.
 * Se compara el documento con "nombre: descripción" de cada carpeta (decisión 0003).
 */
import { configurarMotores, crearEmbedder, type Embedder } from "@docvault/core/navegador";
import { sugerirPorNombre, textoCarpeta, type Sugerencia } from "@docvault/core";
import type { Carpeta } from "./carpeta";

configurarMotores({ ortWasm: new URL("/motores/ort/", location.href).href });

const MODELO = "Xenova/multilingual-e5-small";
let cargando: Promise<Embedder> | null = null;

/** Carga el modelo una sola vez (la primera llamada tarda; las demás son inmediatas). */
export function cargarModelo(): Promise<Embedder> {
  cargando ??= (async () => {
    // Si la app tiene una copia local del modelo (/modelos/), la usa y no baja nada.
    const local = await fetch(`/modelos/${MODELO}/config.json`, { method: "HEAD" }).then((r) => r.ok, () => false);
    return (await crearEmbedder(MODELO, local ? new URL("/modelos/", location.href).href : undefined)).embed;
  })().catch((e) => { cargando = null; throw e; });
  return cargando;
}

/**
 * Las carpetas ordenadas de la más parecida a la menos.
 * Se compara el texto del documento (como en el banco de la fase 0); el nombre del
 * archivo solo se usa si el documento no tiene texto. Las carpetas con descripción
 * van primero: sin descripción la sugerencia acierta mucho menos (decisión 0003).
 */
export async function sugerirCarpeta(texto: string, nombreArchivo: string, carpetas: Carpeta[]): Promise<Sugerencia[]> {
  if (carpetas.length === 0) return [];
  const embed = await cargarModelo();
  const contenido = (texto.trim() || nombreArchivo.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ")).slice(0, 1500);
  const [vecDoc] = await embed([contenido]);
  const vecCarpetas = await embed(carpetas.map((c) => textoCarpeta(c, true)));
  const conDescripcion = new Set(carpetas.filter((c) => c.descripcion).map((c) => c.nombre));
  return sugerirPorNombre(vecDoc!, vecCarpetas, carpetas.map((c) => c.nombre))
    .sort((a, b) => Number(conDescripcion.has(b.carpeta)) - Number(conDescripcion.has(a.carpeta)));
}
