/**
 * Lectura de fechas y detección de la fecha de vencimiento, en español e inglés.
 *
 * Regla: solo se toma como vencimiento una fecha que aparece justo después de
 * una palabra de vencimiento ("vence", "válido hasta", "expires", "due date"...),
 * en la misma línea. Si hay varias, se toma la más lejana en el tiempo.
 * Una fecha numérica como 03/04/2027 es ambigua cuando día y mes pueden
 * intercambiarse: se lee según el idioma del documento y se marca para preguntar.
 */
import { plano } from "./texto";
import type { Idioma } from "./idioma";

export interface FechaLeida {
  iso: string;               // AAAA-MM-DD según la lectura del idioma
  texto: string;             // como aparece en el documento
  inicio: number;            // posición en el texto
  ambigua: boolean;
  otraLectura: string | null;
}

export interface Vencimiento {
  fecha: string | null;
  texto: string | null;
  ambigua: boolean;
  otraLectura: string | null;
  candidatas: FechaLeida[];
}

const MESES: Record<string, number> = {
  enero: 1, ene: 1, january: 1, jan: 1,
  febrero: 2, feb: 2, february: 2,
  marzo: 3, mar: 3, march: 3,
  abril: 4, abr: 4, april: 4, apr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6, june: 6,
  julio: 7, jul: 7, july: 7,
  agosto: 8, ago: 8, august: 8, aug: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, september: 9, set: 9,
  octubre: 10, oct: 10, october: 10,
  noviembre: 11, nov: 11, november: 11,
  diciembre: 12, dic: 12, december: 12, dec: 12,
};
const MES = Object.keys(MESES).sort((a, b) => b.length - a.length).join("|");

const RE_DIA_MES = new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${MES})\\.?,?\\s*(?:de\\s+|del\\s+)?(\\d{4})\\b`, "g");
const RE_MES_DIA = new RegExp(`\\b(${MES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "g");
const RE_NUM = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g;
const RE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

function iso(a: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCMonth() !== m - 1) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Todas las fechas completas (día, mes y año) que aparecen en el texto. */
export function leerFechas(texto: string, idioma: Idioma): FechaLeida[] {
  const t = plano(texto);
  const out: FechaLeida[] = [];
  const ocupado = (i: number) => out.some((f) => i >= f.inicio && i < f.inicio + f.texto.length);
  const agregar = (inicio: number, largo: number, fecha: string | null, ambigua = false, otra: string | null = null) => {
    if (!fecha || ocupado(inicio)) return;
    out.push({ iso: fecha, texto: texto.slice(inicio, inicio + largo), inicio, ambigua, otraLectura: otra });
  };
  for (const m of t.matchAll(RE_DIA_MES)) agregar(m.index!, m[0].length, iso(+m[3], MESES[m[2]], +m[1]));
  for (const m of t.matchAll(RE_MES_DIA)) agregar(m.index!, m[0].length, iso(+m[3], MESES[m[1]], +m[2]));
  for (const m of t.matchAll(RE_ISO)) agregar(m.index!, m[0].length, iso(+m[1], +m[2], +m[3]));
  for (const m of t.matchAll(RE_NUM)) {
    const x = +m[1], y = +m[2], a = +m[3];
    const diaMes = iso(a, y, x);   // x = día, y = mes
    const mesDia = iso(a, x, y);   // x = mes, y = día
    if (diaMes && mesDia && diaMes !== mesDia) {
      const [propia, otra] = idioma === "en" ? [mesDia, diaMes] : [diaMes, mesDia];
      agregar(m.index!, m[0].length, propia, true, otra);
    } else {
      agregar(m.index!, m[0].length, diaMes ?? mesDia);
    }
  }
  return out.sort((a, b) => a.inicio - b.inicio);
}

const CLAVES = [
  // español
  "fecha de vencimiento", "vencimiento", "vence", "vencen", "venceran", "vencera",
  "valido hasta", "valida hasta", "vigente hasta", "vigencia hasta", "hasta el", "hasta",
  "fecha limite", "expira", "caduca", "caducidad", "termina", "finaliza", "fecha de fin", "renovacion",
  // inglés
  "expiration date", "expiration", "expires on", "expires", "expire", "expiry",
  "valid until", "valid through", "valid thru", "due date", "due on", "due by",
  "ends on", "ends", "until", "terminates", "renewal date", "end date", "renews on",
];
const RE_CLAVE = new RegExp(`\\b(${CLAVES.map((c) => c.replace(/ /g, "\\s+")).join("|")})\\b`, "g");
const VENTANA = 40; // caracteres después de la palabra clave

/** Busca la fecha de vencimiento del documento. */
export function detectarVencimiento(texto: string, idioma: Idioma): Vencimiento {
  const fechas = leerFechas(texto, idioma);
  const t = plano(texto);
  const candidatas: FechaLeida[] = [];
  for (const m of t.matchAll(RE_CLAVE)) {
    const fin = m.index! + m[0].length;
    const saltoLinea = t.indexOf("\n", fin);
    const limite = Math.min(fin + VENTANA, saltoLinea === -1 ? Infinity : saltoLinea);
    const f = fechas.find((f) => f.inicio >= fin && f.inicio <= limite);
    if (f && !candidatas.includes(f)) candidatas.push(f);
  }
  if (candidatas.length === 0) return { fecha: null, texto: null, ambigua: false, otraLectura: null, candidatas };
  const elegida = candidatas.reduce((a, b) => (b.iso > a.iso ? b : a));
  return { fecha: elegida.iso, texto: elegida.texto, ambigua: elegida.ambigua, otraLectura: elegida.otraLectura, candidatas };
}
