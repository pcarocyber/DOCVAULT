/** Prueba del índice: tiempo para indexar 1.000 documentos y para buscar, y si encuentra lo esperado. */
import type { FilaClave } from "../lib/tipos";
import { type Contexto, mediana, fichas } from "./comun";

export interface Consulta { consulta: string; esperados: string[] }

export function consultasDesdeClave(clave: FilaClave[], textos: Map<string, string>, extra: string[]): Consulta[] {
  const vistas = new Set<string>();
  const consultas: string[] = [];
  for (const c of clave) {
    const q = fichas(c.titulo).filter((p) => p.length >= 5 && !/^\d+$/.test(p)).slice(0, 2).join(" ");
    if (q && !vistas.has(q)) { vistas.add(q); consultas.push(q); }
  }
  for (const q of extra) if (!vistas.has(q)) { vistas.add(q); consultas.push(q); }
  return consultas.map((consulta) => {
    const terminos = consulta.split(/\s+/).map((t) => fichas(t).join(" ")).filter(Boolean);
    const esperados = clave
      .filter((c) => {
        const t = ` ${fichas(textos.get(c.archivo) ?? "").join(" ")} `;
        return terminos.every((term) => t.includes(` ${term} `));
      })
      .map((c) => c.archivo);
    return { consulta, esperados };
  });
}


export function medirBusqueda(ctx: Contexto, consultas: Consulta[]) {
  const { crudo } = ctx;
  let busqueda: Record<string, unknown>;
  if (crudo.indice.ok) {
    const ix = crudo.indice;
    const esp = new Map(consultas.map((c) => [c.consulta, c.esperados]));
    const detalle = ix.consultas.map((q) => {
      const e = esp.get(q.consulta) ?? [];
      const hallados = e.filter((x) => q.ids.includes(x));
      return { consulta: q.consulta, segundos: q.segundos, esperados: e, hallados, faltan: e.filter((x) => !hallados.includes(x)) };
    });
    const totalEsp = detalle.reduce((a, d) => a + d.esperados.length, 0);
    busqueda = {
      ok: true, documentos: ix.documentos, segundosAbrir: ix.segundosAbrir, segundosAgregar: ix.segundosAgregar,
      consultas: detalle.length,
      segundosMediana: mediana(detalle.map((d) => d.segundos)),
      segundosMax: Math.max(...detalle.map((d) => d.segundos)),
      recuperacion: totalEsp ? detalle.reduce((a, d) => a + d.hallados.length, 0) / totalEsp : NaN,
      detalle,
    };
  } else {
    busqueda = { ok: false, error: crudo.indice.error };
  }

  return busqueda;
}
