/** Utilidades de texto compartidas: normalización, palabras y comparación. */

const ACENTOS: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n",
  à: "a", è: "e", ì: "i", ò: "o", ù: "u", â: "a", ê: "e", î: "i", ô: "o", û: "u", ç: "c",
};

/** Minúsculas y sin acentos, conservando la longitud (útil para buscar posiciones). */
export function plano(texto: string): string {
  let out = "";
  for (const c of texto.normalize("NFC").toLowerCase()) out += ACENTOS[c] ?? c;
  return out;
}

/** Palabras en minúsculas, sin signos de puntuación al inicio ni al final. Conserva acentos. */
export function palabras(texto: string): string[] {
  return texto
    .normalize("NFC")
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((p) => p.length > 0);
}

/**
 * Porcentaje de palabras esperadas que aparecen bien leídas, en orden.
 * Alinea las dos listas con distancia de edición (Levenshtein por palabras)
 * y cuenta las coincidencias exactas.
 */
export function palabrasCorrectas(esperado: string, obtenido: string): {
  esperadas: number; correctas: number; proporcion: number; tasaError: number;
} {
  const a = palabras(esperado);
  const b = palabras(obtenido);
  const n = a.length, m = b.length;
  // dp[i][j] = costo mínimo; guardamos también coincidencias.
  let prev = new Array<number>(m + 1);
  let prevOk = new Array<number>(m + 1).fill(0);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1);
    const curOk = new Array<number>(m + 1);
    cur[0] = i; curOk[0] = 0;
    for (let j = 1; j <= m; j++) {
      const igual = a[i - 1] === b[j - 1];
      const sub = prev[j - 1] + (igual ? 0 : 1);
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      if (sub <= del && sub <= ins) { cur[j] = sub; curOk[j] = prevOk[j - 1] + (igual ? 1 : 0); }
      else if (del <= ins) { cur[j] = del; curOk[j] = prevOk[j]; }
      else { cur[j] = ins; curOk[j] = curOk[j - 1]; }
    }
    prev = cur; prevOk = curOk;
  }
  const correctas = prevOk[m];
  return {
    esperadas: n,
    correctas,
    proporcion: n === 0 ? 1 : correctas / n,
    tasaError: n === 0 ? 0 : prev[m] / n,
  };
}
