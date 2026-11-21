/** Prueba de duplicados: el mismo papel escaneado dos veces y versiones con un cambio pequeño. */
import { buscarDuplicados } from "@docvault/core";
import { type Contexto } from "./comun";

export function medirDuplicados(ctx: Contexto) {
  const { crudo, filas, config } = ctx;
  const dup = buscarDuplicados(
    crudo.documentos.map((d) => ({ id: d.archivo, hash: d.hash, texto: d.texto })),
    { umbralParecido: config.duplicados.umbral_parecido, umbralCasiIdentico: config.duplicados.umbral_casi_identico },
  );
  const conExt = (base: string) => filas.find((c) => c.archivo.replace(/\.\w+$/, "") === base)?.archivo ?? base;
  const paresEsperados = filas
    .filter((c) => c.duplicado_de || c.version_de)
    .map((c) => ({ a: conExt(c.duplicado_de || c.version_de), b: c.archivo, clase: c.duplicado_de ? "mismo papel" : "versión" }));
  const clavePar = (a: string, b: string) => [a, b].sort().join("+");
  const esperadosSet = new Set(paresEsperados.map((p) => clavePar(p.a, p.b)));
  const sim = new Map(dup.todas.map((t) => [clavePar(t.a, t.b), t.similitud]));
  const encontrados = new Map(dup.pares.map((p) => [clavePar(p.a, p.b), p]));
  const noPares = dup.todas.filter((t) => !esperadosSet.has(clavePar(t.a, t.b))).sort((x, y) => y.similitud - x.similitud);
  const duplicados = {
    umbral: config.duplicados.umbral_parecido,
    esperados: paresEsperados.map((p) => ({
      ...p, similitud: sim.get(clavePar(p.a, p.b)) ?? 0,
      encontrado: encontrados.has(clavePar(p.a, p.b)), tipo: encontrados.get(clavePar(p.a, p.b))?.tipo ?? "",
    })),
    falsosPositivos: dup.pares.filter((p) => !esperadosSet.has(clavePar(p.a, p.b))),
    mayorSimilitudNoPar: noPares[0] ?? null,
    exactos: dup.pares.filter((p) => p.tipo === "exacto").length,
  };

  return duplicados;
}
