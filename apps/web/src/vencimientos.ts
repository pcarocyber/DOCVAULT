/**
 * Las fechas de vencimiento que decidió el usuario (confirmó, corrigió o dijo que
 * no vence). Viven en el índice y también en .docvault/vencimientos.json dentro de
 * su carpeta, por código: así sobreviven aunque Chrome borre el índice o el archivo
 * cambie de nombre.
 */
import type { EstadoVence, Indice } from "@docvault/indice";
import { DECIDIDO_POR_USUARIO } from "@docvault/core";
import { guardarAjusteJson, leerAjusteJson, pedirEscritura, puedeEscribir } from "./carpeta";

const ARCHIVO = "vencimientos.json";

interface Decision { vence: string | null; estado: EstadoVence }
export interface VencimientosGuardados { version: 1; codigos: Record<string, Decision> }

export async function leerVencimientosGuardados(raiz: FileSystemDirectoryHandle): Promise<VencimientosGuardados | null> {
  const g = await leerAjusteJson<VencimientosGuardados>(raiz, ARCHIVO);
  return g && g.codigos ? g : null;
}

/** Vuelve a poner en el índice las decisiones guardadas en la carpeta. Devuelve cuántas aplicó. */
export function aplicarGuardados(indice: Indice, g: VencimientosGuardados | null): number {
  if (!g) return 0;
  let n = 0;
  for (const d of indice.listar()) {
    const x = d.codigo ? g.codigos[d.codigo] : undefined;
    if (!x || !DECIDIDO_POR_USUARIO.includes(x.estado)) continue;
    if (d.venceEstado === x.estado && d.vence === x.vence) continue;
    indice.ponerVencimiento(d.id, { vence: x.vence, venceEstado: x.estado, venceTexto: d.venceTexto, venceOtra: null }, true);
    n++;
  }
  return n;
}

/**
 * Guarda lo que decidió el usuario sobre la fecha de un documento.
 * La primera vez pide permiso para escribir en la carpeta. Sin permiso, la
 * decisión queda solo en el índice. Devuelve si quedó también en la carpeta.
 */
export async function guardarDecision(
  raiz: FileSystemDirectoryHandle, indice: Indice, id: string, vence: string | null, estado: EstadoVence,
): Promise<boolean> {
  const previo = indice.porId(id);
  indice.ponerVencimiento(id, { vence, venceEstado: estado, venceTexto: previo?.venceTexto ?? null, venceOtra: null }, true);
  if (!(await puedeEscribir(raiz)) && !(await pedirEscritura(raiz))) return false;
  return guardarVencimientosEnCarpeta(raiz, indice);
}

/** Copia todas las decisiones del índice a .docvault/vencimientos.json (si hay permiso; no lo pide). */
export async function guardarVencimientosEnCarpeta(raiz: FileSystemDirectoryHandle, indice: Indice): Promise<boolean> {
  if (!(await puedeEscribir(raiz))) return false;
  const anteriores = (await leerVencimientosGuardados(raiz))?.codigos ?? {};
  const codigos: Record<string, Decision> = {};
  const presentes = new Set<string>();
  for (const d of indice.listar()) {
    if (!d.codigo) continue;
    presentes.add(d.codigo);
    if (d.venceEstado && DECIDIDO_POR_USUARIO.includes(d.venceEstado)) codigos[d.codigo] = { vence: d.vence, estado: d.venceEstado };
  }
  // Las de documentos que ya no están se guardan igual: el código no se reutiliza y el archivo puede volver.
  for (const [c, x] of Object.entries(anteriores)) if (!presentes.has(c)) codigos[c] = x;
  try {
    await guardarAjusteJson(raiz, ARCHIVO, { version: 1, codigos } satisfies VencimientosGuardados);
    return true;
  } catch {
    return false;
  }
}
