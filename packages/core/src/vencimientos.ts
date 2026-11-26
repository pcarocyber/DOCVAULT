/**
 * Vencimientos: qué tan cerca está una fecha y en qué estado está su lectura.
 * La fecha se detecta en el texto (fechas.ts); el usuario la confirma o la corrige.
 */
import { detectarIdioma } from "./idioma";
import { detectarVencimiento } from "./fechas";

/**
 * - detectada: la app la leyó y no hay duda de cómo leerla.
 * - por confirmar: fecha como 03/04/2027, que se puede leer de dos formas.
 * - no detectada: la app no encontró fecha de vencimiento.
 * - confirmada: el usuario dijo que la fecha detectada es correcta.
 * - manual: el usuario escribió la fecha.
 * - sin vencimiento: el usuario dijo que el documento no vence.
 */
export type EstadoVence = "detectada" | "por confirmar" | "no detectada" | "confirmada" | "manual" | "sin vencimiento";

/** Los estados que decidió el usuario: la app no los cambia aunque vuelva a leer el documento. */
export const DECIDIDO_POR_USUARIO: readonly EstadoVence[] = ["confirmada", "manual", "sin vencimiento"];

export interface DatosVence { vence: string | null; venceEstado: EstadoVence; venceTexto: string | null; venceOtra: string | null }

/** Lee la fecha de vencimiento de un texto, eligiendo el idioma del documento. */
export function analizarVencimiento(texto: string): DatosVence {
  const v = detectarVencimiento(texto, detectarIdioma(texto).idioma);
  if (!v.fecha) return { vence: null, venceEstado: "no detectada", venceTexto: null, venceOtra: null };
  return { vence: v.fecha, venceEstado: v.ambigua ? "por confirmar" : "detectada", venceTexto: v.texto, venceOtra: v.otraLectura };
}

/** AAAA-MM-DD de una fecha, en la hora local del equipo. */
export function hoyIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Días desde `hoy` hasta `fecha` (negativo si ya pasó). Ambas en AAAA-MM-DD. */
export function diasHasta(fecha: string, hoy: string): number {
  const ms = (s: string) => { const [a, m, d] = s.split("-").map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((ms(fecha) - ms(hoy)) / 86_400_000);
}

export type Etapa = "vencido" | "esta semana" | "este mes" | "más adelante";

/** Días antes del vencimiento en que empieza el aviso. */
export const DIAS_AVISO = 30;

export function etapa(fecha: string, hoy: string): Etapa {
  const d = diasHasta(fecha, hoy);
  if (d < 0) return "vencido";
  if (d <= 7) return "esta semana";
  if (d <= DIAS_AVISO) return "este mes";
  return "más adelante";
}

/** "vence hoy", "vence mañana", "vence en 12 días", "venció ayer", "venció hace 3 días". */
export function cuandoVence(fecha: string, hoy: string): string {
  const d = diasHasta(fecha, hoy);
  if (d === 0) return "vence hoy";
  if (d === 1) return "vence mañana";
  if (d > 1) return `vence en ${d} días`;
  if (d === -1) return "venció ayer";
  return `venció hace ${-d} días`;
}

/** Una fecha AAAA-MM-DD escrita para leer: "3 abr 2027". */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
  return `${d} ${meses[m - 1]} ${a}`;
}

/** Una fecha AAAA-MM-DD completa: "3 de abril de 2027". */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${d} de ${meses[m - 1]} de ${a}`;
}

/** ¿Es una fecha válida AAAA-MM-DD? */
export function fechaValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const f = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return f.getUTCFullYear() === +m[1] && f.getUTCMonth() === +m[2] - 1 && f.getUTCDate() === +m[3];
}
