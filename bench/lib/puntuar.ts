/** Junta las pruebas de bench/pruebas y compara todo con la clave de respuestas. */
import type { Config, Crudo, FilaClave, MedicionOllama, Equipo, Umbrales } from "./tipos";
import type { Contexto } from "../pruebas/comun";
import { medirLectura } from "../pruebas/ocr";
import { medirFechas } from "../pruebas/fechas";
import { medirCarpeta } from "../pruebas/carpeta";
import { medirDuplicados } from "../pruebas/duplicados";
import { medirBusqueda, type Consulta } from "../pruebas/indice";

export { consultasDesdeClave } from "../pruebas/indice";

export function puntuar(
  crudo: Crudo, clave: FilaClave[], esperados: Map<string, string>, consultas: Consulta[],
  ollama: MedicionOllama, config: Config, umbrales: Umbrales, equipo: Equipo,
) {
  const porArchivo = new Map(crudo.documentos.map((d) => [d.archivo, d]));
  const filas = clave.filter((c) => porArchivo.has(c.archivo));
  const ctx: Contexto = { crudo, filas, porArchivo, esperados, config, umbrales };
  return {
    equipo,
    ...medirLectura(ctx),
    fechas: medirFechas(ctx),
    carpeta: medirCarpeta(ctx),
    duplicados: medirDuplicados(ctx),
    busqueda: medirBusqueda(ctx, consultas),
    ollama,
  };
}

export type Resultados = ReturnType<typeof puntuar>;
