/** Prueba de sugerencia de carpeta: qué tan seguido la primera sugerencia es la correcta. */
import { sugerirPorNombre } from "@docvault/core";
import { type Contexto, prom } from "./comun";

export function medirCarpeta(ctx: Contexto) {
  const { crudo, filas, config } = ctx;
  let carpeta: Record<string, unknown>;
  if (crudo.embeddings.ok) {
    const e = crudo.embeddings;
    const nombres = config.categorias.map((c) => c.nombre);
    const idx = new Map(crudo.documentos.map((d, i) => [d.archivo, i]));
    const modo = (fn: (vec: number[]) => { carpeta: string }[]) => {
      const docs = filas.map((c) => {
        const r = fn(e.vecDocs[idx.get(c.archivo)!]);
        return { archivo: c.archivo, correcta: c.carpeta_correcta, sugerida: r[0]?.carpeta ?? "", top3: r.slice(0, 3).map((x) => x.carpeta) };
      });
      return {
        top1: prom(docs.map((d) => (d.sugerida === d.correcta ? 1 : 0))),
        top3: prom(docs.map((d) => (d.top3.includes(d.correcta) ? 1 : 0))),
        docs,
      };
    };
    carpeta = {
      ok: true, segundosCarga: e.segundosCarga, segundosPorDocumento: e.segundosPorDocumento,
      modos: {
        solo_nombre: modo((v) => sugerirPorNombre(v, e.vecNombre, nombres)),
        nombre_y_descripcion: modo((v) => sugerirPorNombre(v, e.vecDescripcion, nombres)),
      },
    };
  } else {
    carpeta = { ok: false, error: crudo.embeddings.error };
  }

  return carpeta;
}
