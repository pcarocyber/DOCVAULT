/**
 * Código único de cada documento (DV-000123) y su código de barras Code 128.
 * El número no se reutiliza: aunque se borre un documento, el siguiente sigue la cuenta.
 */

export const PREFIJO = "DV-";

export function formatearCodigo(n: number): string {
  return PREFIJO + String(n).padStart(6, "0");
}

/**
 * Reconoce un código escrito o escaneado: "DV-000123", "dv 123", "DV000123",
 * o seis dígitos exactos ("000123"). Devuelve el código normalizado o null.
 */
export function leerCodigo(texto: string): string | null {
  const t = texto.trim();
  // Acepta cualquier signo entre "DV" y el número: un lector USB con el teclado en español
  // escribe "DV'000123" en vez de "DV-000123". También un enlace que termine en el código.
  const conPrefijo = t.match(/^(?:.*[/#=])?dv[^a-z0-9]?0*(\d{1,9})$/i);
  if (conPrefijo) return formatearCodigo(Number(conPrefijo[1]));
  if (/^\d{6}$/.test(t)) return formatearCodigo(Number(t));
  return null;
}

export function numeroDeCodigo(codigo: string): number {
  return Number(codigo.slice(PREFIJO.length)) || 0;
}

export interface ArchivoParaCodigo { ruta: string; nombre: string; tamano: number; modificado: number }
export interface ArchivoQuitado extends ArchivoParaCodigo { codigo: string | null }

/**
 * Busca, para cada archivo nuevo, si es uno que se movió o se renombró: un archivo
 * que desapareció con el mismo tamaño y la misma fecha de modificación (o, si no,
 * el mismo nombre y tamaño). Devuelve ruta nueva → archivo quitado que le corresponde.
 */
export function detectarMovidos(nuevos: ArchivoParaCodigo[], quitados: ArchivoQuitado[]): Map<string, ArchivoQuitado> {
  const libres = new Set(quitados);
  const out = new Map<string, ArchivoQuitado>();
  const buscar = (igual: (q: ArchivoQuitado, n: ArchivoParaCodigo) => boolean) => {
    for (const n of nuevos) {
      if (out.has(n.ruta)) continue;
      const candidatos = [...libres].filter((q) => igual(q, n));
      if (candidatos.length === 1) { out.set(n.ruta, candidatos[0]!); libres.delete(candidatos[0]!); }
    }
  };
  buscar((q, n) => q.tamano === n.tamano && q.modificado === n.modificado);
  buscar((q, n) => q.tamano === n.tamano && q.nombre === n.nombre);
  return out;
}

// ---------- Code 128 (juego B: letras, números y signos comunes) ----------

const PATRONES = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

export interface Barra { x: number; ancho: number }

/**
 * Valores de Code 128 para `texto` (caracteres ASCII 32 a 126). Usa el juego B para
 * letras y signos, y el juego C (dos cifras por símbolo) para tramos de 4 cifras o más:
 * así "DV-000123" ocupa menos y cada barra puede ser más gruesa (se lee mejor con cámara).
 */
export function valoresCode128(texto: string): number[] {
  const t = [...texto];
  for (const c of t) {
    const v = c.charCodeAt(0) - 32;
    if (v < 0 || v > 94) throw new Error(`Code 128 no admite el carácter "${c}"`);
  }
  const valores: number[] = [];
  let juego: "B" | "C" | null = null;
  const usar = (j: "B" | "C") => {
    if (juego === j) return;
    valores.push(juego === null ? (j === "B" ? 104 : 105) : (j === "C" ? 99 : 100));
    juego = j;
  };
  const esCifra = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
  let i = 0;
  while (i < t.length) {
    let tramo = 0;
    while (esCifra(t[i + tramo])) tramo++;
    if (tramo >= 4) {
      if (tramo % 2 === 1) { usar("B"); valores.push(t[i]!.charCodeAt(0) - 32); i++; tramo--; }
      usar("C");
      for (; tramo >= 2; tramo -= 2, i += 2) valores.push(Number(t[i]! + t[i + 1]!));
    } else {
      usar("B");
      valores.push(t[i]!.charCodeAt(0) - 32);
      i++;
    }
  }
  if (juego === null) usar("B");
  const control = valores.reduce((s, v, k) => s + v * Math.max(k, 1), 0) % 103;
  return [...valores, control, 106];
}

/** Barras de Code 128 para `texto`, en módulos. Incluye 10 módulos de margen a cada lado, que los lectores necesitan. */
export function code128(texto: string): { barras: Barra[]; ancho: number } {
  const barras: Barra[] = [];
  let x = 10;
  for (const v of valoresCode128(texto)) {
    [...PATRONES[v]!].forEach((w, i) => {
      const ancho = Number(w);
      if (i % 2 === 0) barras.push({ x, ancho });
      x += ancho;
    });
  }
  return { barras, ancho: x + 10 };
}
