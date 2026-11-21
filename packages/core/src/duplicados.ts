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
