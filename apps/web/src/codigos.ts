/**
 * Códigos únicos de los documentos (DV-000123).
 * Viven en el índice y, cuando hay permiso de escritura, también en
 * .docvault/codigos.json dentro de la carpeta del usuario: así sobreviven
 * aunque Chrome borre el índice y haya que reconstruirlo.
 */
import type { Indice } from "@docvault/indice";
import { formatearCodigo, numeroDeCodigo } from "@docvault/core";
import { guardarAjusteJson, leerAjusteJson, puedeEscribir } from "./carpeta";

const ARCHIVO = "codigos.json";
const SIGUIENTE = "siguiente_codigo";

export interface CodigosGuardados { version: 1; siguiente: number; codigos: Record<string, string> }

export async function leerCodigosGuardados(raiz: FileSystemDirectoryHandle): Promise<CodigosGuardados | null> {
  const g = await leerAjusteJson<CodigosGuardados>(raiz, ARCHIVO);
  return g && typeof g.siguiente === "number" && g.codigos ? g : null;
}

/**
 * Da código a los documentos que no tienen. Primero respeta el que estaba guardado
 * en la carpeta para esa ruta (si nadie más lo usa); si no, el siguiente número.
 * Los números nunca se reutilizan. Devuelve cuántos códigos se asignaron.
 */
export function asignarFaltantes(indice: Indice, guardados?: CodigosGuardados | null): number {
  const docs = indice.listar();
  const usados = new Set(docs.map((d) => d.codigo).filter((c): c is string => !!c));
  let siguiente = Math.max(
    Number(indice.ajuste(SIGUIENTE) ?? 1),
    guardados?.siguiente ?? 1,
    ...[...usados].map((c) => numeroDeCodigo(c) + 1),
    ...Object.values(guardados?.codigos ?? {}).map((c) => numeroDeCodigo(c) + 1),
  );
  const nuevos = new Map<string, string>();
  for (const d of docs) {
    if (d.codigo) continue;
    const previo = guardados?.codigos[d.id];
    let codigo: string;
    if (previo && !usados.has(previo)) codigo = previo;
    else codigo = formatearCodigo(siguiente++);
    usados.add(codigo);
    nuevos.set(d.id, codigo);
  }
  if (nuevos.size) indice.ponerCodigos(nuevos);
  indice.ponerAjuste(SIGUIENTE, String(siguiente));
  return nuevos.size;
}

/** Copia los códigos a .docvault/codigos.json si ya hay permiso de escritura (no lo pide). */
export async function guardarCodigosEnCarpeta(raiz: FileSystemDirectoryHandle, indice: Indice): Promise<boolean> {
  if (!(await puedeEscribir(raiz))) return false;
  const codigos: Record<string, string> = {};
  for (const d of indice.listar()) if (d.codigo) codigos[d.id] = d.codigo;
  const datos: CodigosGuardados = { version: 1, siguiente: Number(indice.ajuste(SIGUIENTE) ?? 1), codigos };
  try {
    await guardarAjusteJson(raiz, ARCHIVO, datos);
    return true;
  } catch {
    return false;
  }
}
