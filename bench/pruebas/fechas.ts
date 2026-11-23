/** Prueba de fechas de vencimiento, incluidas las ambiguas como 03/04/2027. */
import { detectarIdioma, detectarVencimiento } from "@docvault/core";
import { type Contexto, prom } from "./comun";

export function medirFechas(ctx: Contexto) {
  const { filas, porArchivo, esperados } = ctx;
  const fechasDocs = filas.map((c) => {
    const d = porArchivo.get(c.archivo)!;
    const idioma = detectarIdioma(d.texto).idioma;
    const v = detectarVencimiento(d.texto, idioma);
    const ambiguaClave = c.fecha_ambigua === "sí";
    const bien = (v.fecha ?? "") === c.vence && (!ambiguaClave || v.ambigua);
    const exacto = esperados.get(c.archivo) ?? "";
    const vExacto = detectarVencimiento(exacto, detectarIdioma(exacto).idioma);
    const bienExacto = (vExacto.fecha ?? "") === c.vence && (!ambiguaClave || vExacto.ambigua);
    return {
      archivo: c.archivo, metodo: d.metodo, idiomaClave: c.idioma, idiomaDetectado: idioma,
      esperado: c.vence || "(sin vencimiento)", obtenido: v.fecha ?? "(sin vencimiento)",
      comoAparece: v.texto ?? "", ambiguaClave, ambiguaDetectada: v.ambigua, bien, bienConTextoExacto: bienExacto,
    };
  });
  const ambiguas = fechasDocs.filter((f) => f.ambiguaClave);
  const fechas = {
    documentos: fechasDocs,
    acierto: prom(fechasDocs.map((f) => (f.bien ? 1 : 0))),
    aciertoConTextoExacto: prom(fechasDocs.map((f) => (f.bienConTextoExacto ? 1 : 0))),
    ambiguasTotal: ambiguas.length,
    ambiguasPreguntadas: ambiguas.filter((f) => f.ambiguaDetectada).length,
    preguntasDeMas: fechasDocs.filter((f) => !f.ambiguaClave && f.ambiguaDetectada).length,
    idiomaAcierto: prom(fechasDocs.map((f) => (f.idiomaClave === f.idiomaDetectado ? 1 : 0))),
  };

  return fechas;
}
