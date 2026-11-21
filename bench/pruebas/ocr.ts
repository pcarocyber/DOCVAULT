/** Prueba de OCR y de lectura de PDF digitales: tiempo por página y palabras correctas. */
import { palabrasCorrectas } from "@docvault/core";
import { type Contexto, prom } from "./comun";

export function medirLectura(ctx: Contexto) {
  const { crudo, filas, porArchivo, esperados, umbrales } = ctx;
  const lectura = filas.map((c) => {
    const d = porArchivo.get(c.archivo)!;
    const p = palabrasCorrectas(esperados.get(c.archivo) ?? "", d.texto);
    return {
      archivo: c.archivo, tipo: c.tipo, defecto: c.defecto, idioma: c.idioma, metodo: d.metodo,
      paginas: d.paginas, segundosPorPagina: prom(d.segundosPorPagina), confianza: d.confianza,
      palabrasEsperadas: p.esperadas, palabrasCorrectas: p.correctas, proporcion: p.proporcion,
    };
  });
  const conOcr = lectura.filter((l) => l.metodo === "OCR");
  const limpios = conOcr.filter((l) => umbrales.ocr.defectos_limpios.includes(l.defecto));
  const tiemposPagina = crudo.documentos.filter((d) => d.metodo === "OCR").flatMap((d) => d.segundosPorPagina);
  const ocr = {
    documentos: conOcr.length,
    segundosInicio: crudo.ocrSegundosInicio,
    promedioSegundosPagina: prom(tiemposPagina),
    maxSegundosPagina: Math.max(...tiemposPagina),
    aciertoLimpios: prom(limpios.map((l) => l.proporcion)),
    limpios: limpios.map((l) => l.archivo),
    aciertoTodos: prom(conOcr.map((l) => l.proporcion)),
  };
  const digitales = lectura.filter((l) => l.metodo === "texto del PDF");
  const pdfDigital = { documentos: digitales.length, acierto: prom(digitales.map((l) => l.proporcion)), segundosPorPagina: prom(digitales.map((l) => l.segundosPorPagina)) };

  return { lectura, ocr, pdfDigital };
}
