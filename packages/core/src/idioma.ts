/** Detección simple de idioma (español o inglés) contando palabras frecuentes. */
import { plano } from "./texto";

const ES = new Set("de la el en y que los las del por con para una un se al su es como este esta mas o sus le lo fecha".split(" "));
const EN = new Set("the of and to in a is for on with by this that be as are an or your from at will date".split(" "));

export type Idioma = "es" | "en";

export function detectarIdioma(texto: string): { idioma: Idioma; confianza: number } {
  let es = 0, en = 0;
  for (const p of plano(texto).split(/[^a-z]+/)) {
    if (ES.has(p)) es++;
    if (EN.has(p)) en++;
  }
  const total = es + en;
  if (total === 0) return { idioma: "es", confianza: 0 };
  return es >= en ? { idioma: "es", confianza: es / total } : { idioma: "en", confianza: en / total };
}
