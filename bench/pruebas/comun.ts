/** Utilidades y contexto compartidos por las pruebas. */
import { plano } from "@docvault/core";
import type { Config, Crudo, DocCrudo, FilaClave, Umbrales } from "../lib/tipos";

export const prom = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export const mediana = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const fichas = (t: string) => plano(t).split(/[^a-z0-9]+/).filter(Boolean);

/** Lo que necesita cada prueba: lo que hizo el código y la clave de respuestas. */
export interface Contexto {
  crudo: Crudo;
  filas: FilaClave[];
  porArchivo: Map<string, DocCrudo>;
  esperados: Map<string, string>;
  config: Config;
  umbrales: Umbrales;
}
