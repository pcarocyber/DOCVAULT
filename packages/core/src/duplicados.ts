/**
 * Detección de duplicados.
 * - Exactos: mismo hash SHA-256 de los bytes del archivo.
 * - Parecidos: similitud de Jaccard entre "huellas" de texto (trozos de 5 letras),
 *   que tolera errores sueltos del OCR. Sirve para el mismo papel escaneado dos
 *   veces y para versiones con un cambio pequeño.
 */
import { plano } from "./texto";

export async function sha256(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const datos = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const h = await crypto.subtle.digest("SHA-256", datos as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function huella(texto: string, n = 5): Set<string> {
  const t = plano(texto).replace(/[^a-z0-9]+/g, " ").trim();
  const s = new Set<string>();
  for (let i = 0; i + n <= t.length; i++) s.add(t.slice(i, i + n));
  return s;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let comun = 0;
  const [chico, grande] = a.size < b.size ? [a, b] : [b, a];
  for (const x of chico) if (grande.has(x)) comun++;
  return comun / (a.size + b.size - comun);
}

export interface Par { a: string; b: string; similitud: number; tipo: "exacto" | "casi idéntico" | "parecido" }

export interface OpcionesDuplicados { umbralParecido: number; umbralCasiIdentico: number }

export function buscarDuplicados(
  docs: { id: string; hash: string; texto: string }[],
  op: OpcionesDuplicados,
): { pares: Par[]; todas: { a: string; b: string; similitud: number }[] } {
  const huellas = docs.map((d) => huella(d.texto));
  const pares: Par[] = [];
  const todas: { a: string; b: string; similitud: number }[] = [];
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i].id, b = docs[j].id;
      if (docs[i].hash === docs[j].hash) { pares.push({ a, b, similitud: 1, tipo: "exacto" }); todas.push({ a, b, similitud: 1 }); continue; }
      const s = jaccard(huellas[i], huellas[j]);
      todas.push({ a, b, similitud: s });
      if (s >= op.umbralParecido) pares.push({ a, b, similitud: s, tipo: s >= op.umbralCasiIdentico ? "casi idéntico" : "parecido" });
    }
  }
  return { pares, todas };
}

/**
 * Firma corta (MinHash) de una huella: permite comparar miles de documentos entre
 * sí sin medir cada par a fondo. Dos firmas coinciden en la misma proporción de
 * posiciones que la similitud de Jaccard de sus huellas, más o menos.
 */
const N_FIRMA = 64;
const SEMILLAS = Array.from({ length: N_FIRMA }, (_, i) => [Math.imul(i + 1, 0x9e3779b1) | 1, Math.imul(i + 7, 0x85ebca6b)] as const);

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function firma(h: Set<string>): Uint32Array {
  const f = new Uint32Array(N_FIRMA).fill(0xffffffff);
  for (const t of h) {
    const x = fnv(t);
    for (let i = 0; i < N_FIRMA; i++) {
      let v = (Math.imul(SEMILLAS[i][0], x) + SEMILLAS[i][1]) >>> 0;
      v = Math.imul(v ^ (v >>> 15), 0x2c1b3c6d); v = (v ^ (v >>> 12)) >>> 0;
      if (v < f[i]) f[i] = v;
    }
  }
  return f;
}

function parecidoFirmas(a: Uint32Array, b: Uint32Array): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) n++;
  return n / a.length;
}

/** Un documento a comparar. `hash` puede faltar (todavía no se calculó). */
export interface DocComparable { id: string; hash: string | null; texto: string }

/** Menos letras que esto: el texto es muy corto para decir que dos documentos se parecen. */
export const MINIMO_LETRAS = 80;

/**
 * Busca duplicados dentro de un grupo grande de documentos (toda la bóveda).
 * Exactos por hash; parecidos con la firma corta y confirmados con Jaccard.
 */
export interface CacheHuellas { get(id: string): { clave: string; huella: Set<string>; firma: Uint32Array } | undefined; set(id: string, v: { clave: string; huella: Set<string>; firma: Uint32Array }): unknown }

export function duplicadosEnBoveda(docs: DocComparable[], op: OpcionesDuplicados, cache?: CacheHuellas): Par[] {
  const pares: Par[] = [];
  const porHash = new Map<string, string[]>();
  for (const d of docs) if (d.hash) porHash.set(d.hash, [...(porHash.get(d.hash) ?? []), d.id]);
  const exactos = new Set<string>();
  for (const ids of porHash.values()) {
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      pares.push({ a: ids[i], b: ids[j], similitud: 1, tipo: "exacto" });
      exactos.add(`${ids[i]}\u0000${ids[j]}`);
    }
  }
  const conTexto = docs.filter((d) => d.texto.replace(/\s/g, "").length >= MINIMO_LETRAS);
  const huellas: Set<string>[] = [];
  const firmas: Uint32Array[] = [];
  for (const d of conTexto) {
    const clave = `${d.hash ?? ""}:${d.texto.length}`;
    let c = cache?.get(d.id);
    if (!c || c.clave !== clave) { const h = huella(d.texto); c = { clave, huella: h, firma: firma(h) }; cache?.set(d.id, c); }
    huellas.push(c.huella);
    firmas.push(c.firma);
  }
  // Margen: la firma es una estimación, así que se revisa a fondo desde un poco antes del umbral.
  const corte = Math.max(0, op.umbralParecido - 0.15);
  for (let i = 0; i < conTexto.length; i++) {
    for (let j = i + 1; j < conTexto.length; j++) {
      if (parecidoFirmas(firmas[i], firmas[j]) < corte) continue;
      const a = conTexto[i].id, b = conTexto[j].id;
      if (exactos.has(`${a}\u0000${b}`) || exactos.has(`${b}\u0000${a}`)) continue;
      const s = jaccard(huellas[i], huellas[j]);
      if (s >= op.umbralParecido) pares.push({ a, b, similitud: s, tipo: s >= op.umbralCasiIdentico ? "casi idéntico" : "parecido" });
    }
  }
  return pares.sort((x, y) => y.similitud - x.similitud);
}

/** Lo que se parece a un documento nuevo, del más parecido al menos. */
export interface Coincidencia { id: string; similitud: number; tipo: Par["tipo"] }

export function compararConBoveda(
  nuevo: { hash: string | null; texto: string }, docs: DocComparable[], op: OpcionesDuplicados,
): Coincidencia[] {
  const out: Coincidencia[] = [];
  const conTexto = nuevo.texto.replace(/\s/g, "").length >= MINIMO_LETRAS;
  const h = conTexto ? huella(nuevo.texto) : null;
  for (const d of docs) {
    if (nuevo.hash && d.hash === nuevo.hash) { out.push({ id: d.id, similitud: 1, tipo: "exacto" }); continue; }
    if (!h || d.texto.replace(/\s/g, "").length < MINIMO_LETRAS) continue;
    const s = jaccard(h, huella(d.texto));
    if (s >= op.umbralParecido) out.push({ id: d.id, similitud: s, tipo: s >= op.umbralCasiIdentico ? "casi idéntico" : "parecido" });
  }
  return out.sort((a, b) => b.similitud - a.similitud);
}

/** Los umbrales medidos en la fase 0 (bench/config.json). */
export const UMBRALES_DUPLICADOS: OpcionesDuplicados = { umbralParecido: 0.5, umbralCasiIdentico: 0.9 };
