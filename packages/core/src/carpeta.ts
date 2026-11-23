/**
 * Sugerencia de carpeta con embeddings (vectores que representan el sentido del texto).
 * El modelo corre en el navegador con Transformers.js; aquí solo está la lógica
 * de comparación, que no depende del modelo.
 */

export interface Categoria { nombre: string; descripcion?: string }
export interface Sugerencia { carpeta: string; puntaje: number }

export function coseno(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let p = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { p += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return p / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Ordena las carpetas por parecido con el documento (sin ejemplos previos). */
export function sugerirPorNombre(vecDoc: number[], vecCarpetas: number[][], nombres: string[]): Sugerencia[] {
  return nombres
    .map((carpeta, i) => ({ carpeta, puntaje: coseno(vecDoc, vecCarpetas[i]) }))
    .sort((a, b) => b.puntaje - a.puntaje);
}

/** Texto con el que se representa una carpeta para el modelo. */
export function textoCarpeta(c: Categoria, conDescripcion: boolean): string {
  return conDescripcion && c.descripcion ? `${c.nombre}: ${c.descripcion}` : c.nombre;
}
