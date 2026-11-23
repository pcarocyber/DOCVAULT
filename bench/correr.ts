/**
 * npm run banco
 * Corre todo el banco de pruebas de la fase 0 y abre el informe.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BENCH, RESULTADOS, prepararDatos, leerJson, asegurarCarpeta, MODELOS_LOCALES } from "./lib/rutas";
import { iniciarServidor, pluginMotores } from "./lib/servidor";
import { abrirNavegador } from "./lib/navegador";
import { medirOllama } from "./pruebas/resumen";
import { consultasDesdeClave, puntuar } from "./lib/puntuar";
import { escribirInforme } from "./lib/informe";
import { describirEquipo, abrir } from "./lib/sistema";
import type { Config, Crudo, FilaClave, Umbrales } from "./lib/tipos";

const avisar = (m: string) => console.log(m);
const sinOllama = process.argv.includes("--sin-ollama");
const sinAbrir = process.argv.includes("--sin-abrir");
const visible = process.argv.includes("--visible");

async function main() {
  const t0 = Date.now();
  const datos = prepararDatos();
  if (!datos) {
    console.error("\nNo encuentro los documentos de prueba.\nPon documentos-prueba.zip dentro de la carpeta bench/datos y vuelve a intentar.\n");
    process.exit(1);
  }
  const config = leerJson<Config>(join(BENCH, "config.json"));
  const umbrales = leerJson<Umbrales>(join(BENCH, "umbrales.json"));
  const clave = leerJson<FilaClave[]>(join(datos, "respuestas", "clave.json"));
  const esperados = new Map(clave.map((c) => [c.archivo, readFileSync(join(datos, c.texto_esperado), "utf8")]));
  const consultas = consultasDesdeClave(clave, esperados, config.indice.consultas_extra);
  const modeloLocal = existsSync(join(MODELOS_LOCALES, config.modelo_embeddings, "config.json"));

  avisar("\n== DOCVAULT · banco de pruebas de la fase 0 ==\n");
  avisar("1/3  Abriendo el navegador…");
  const { server, url } = await iniciarServidor(join(BENCH, "pagina"), pluginMotores(datos));
  const nav = await abrirNavegador(visible);
  avisar(`     ${nav.nombre} ${nav.version}`);
  let crudo: Crudo;
  try {
    const pagina = await nav.contexto.newPage();
    pagina.on("console", (m) => { const t = m.text(); if (t.startsWith("[banco]")) avisar("     " + t.slice(8)); });
    pagina.on("pageerror", (e) => avisar(`     (error en la página) ${e.message}`));
    await pagina.goto(url);
    await pagina.waitForFunction(() => "banco" in window, null, { timeout: 120_000 });
    avisar("2/3  Leyendo los 30 documentos, sugiriendo carpetas e indexando (puede tardar varios minutos)…");
    crudo = await pagina.evaluate(async (cfg) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).banco.correr(cfg);
    }, {
      documentos: clave.map((c) => c.archivo),
      categorias: config.categorias,
      modeloEmbeddings: config.modelo_embeddings,
      modeloLocal,
      escalaPdf: config.ocr.escala_pdf,
      minimoCaracteresPdf: config.ocr.minimo_caracteres_pdf,
      indice: { total: config.indice.total_documentos, consultas: consultas.map((c) => c.consulta) },
    });
  } finally {
    await nav.contexto.close();
    await server.close();
  }
  if (!crudo.embeddings.ok) avisar(`     Aviso: no se pudo medir la sugerencia de carpeta: ${crudo.embeddings.error}`);
  if (!crudo.indice.ok) avisar(`     Aviso: no se pudo medir el índice: ${crudo.indice.error}`);

  avisar("3/3  Resúmenes con Ollama…");
  const porArchivo = new Map(crudo.documentos.map((d) => [d.archivo, d.texto]));
  const ollama = sinOllama
    ? { disponible: false, error: "Se corrió con --sin-ollama", modelos: [], resumenes: [] }
    : await medirOllama(config.modelos_ollama, config.documentos_resumen.filter((a) => porArchivo.has(a)).map((archivo) => ({ archivo, texto: porArchivo.get(archivo)! })), avisar);
  if (!ollama.disponible) avisar(`     ${ollama.error}. Se marca como pendiente.`);

  const equipo = describirEquipo(`${nav.nombre} ${nav.version}`);
  const res = puntuar(crudo, clave, esperados, consultas, ollama, config, umbrales, equipo);

  const nombre = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const dir = asegurarCarpeta(join(RESULTADOS, nombre));
  const { embeddings, ...crudoSinVectores } = crudo;
  const emb = embeddings.ok ? { ok: true, segundosCarga: embeddings.segundosCarga, segundosPorDocumento: embeddings.segundosPorDocumento } : embeddings;
  writeFileSync(join(dir, "datos-crudos.json"), JSON.stringify({ ...crudoSinVectores, embeddings: emb }, null, 2));
  writeFileSync(join(dir, "resultados.json"), JSON.stringify(res, null, 2));
  writeFileSync(join(RESULTADOS, "ultima-corrida.txt"), nombre + "\n");
  const { resumen, html } = escribirInforme(dir, RESULTADOS, umbrales);

  avisar(`\nListo en ${Math.round((Date.now() - t0) / 1000)} s. Resumen:`);
  for (const r of resumen) avisar(`  ${r.pasa === null ? "PENDIENTE" : r.pasa ? "PASA     " : "NO PASA  "}  ${r.que}`);
  avisar(`\nInforme: ${html}`);
  if (ollama.resumenes.length) avisar("Siguiente paso: npm run calificar (para poner nota a los resúmenes).");
  if (!sinAbrir) abrir(html);
}

main().catch((e) => { console.error("\nEl banco se detuvo por un error:\n", e); process.exit(1); });
