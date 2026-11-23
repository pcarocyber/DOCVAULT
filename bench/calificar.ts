/**
 * npm run calificar
 * Abre una página en tu navegador para poner nota de 1 a 5 a cada resumen.
 * No muestra qué modelo escribió cada resumen, para no influir en la nota.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Connect } from "vite";
import { BENCH, RESULTADOS, leerJson } from "./lib/rutas";
import { iniciarServidor, pluginMotores } from "./lib/servidor";
import { escribirInforme, type Calificaciones } from "./lib/informe";
import { abrir } from "./lib/sistema";
import type { Resultados } from "./lib/puntuar";
import type { Umbrales, DocCrudo } from "./lib/tipos";

const ultima = join(RESULTADOS, "ultima-corrida.txt");
if (!existsSync(ultima)) { console.error("Todavía no hay corridas. Ejecuta primero: npm run banco"); process.exit(1); }
const dir = join(RESULTADOS, readFileSync(ultima, "utf8").trim());
const res = leerJson<Resultados>(join(dir, "resultados.json"));
const crudo = leerJson<{ documentos: DocCrudo[] }>(join(dir, "datos-crudos.json"));
const textos = new Map(crudo.documentos.map((d) => [d.archivo, d.texto]));
const umbrales = leerJson<Umbrales>(join(BENCH, "umbrales.json"));
const rutaCal = join(dir, "calificaciones.json");
const cal: Calificaciones = existsSync(rutaCal) ? leerJson(rutaCal) : {};

// Orden mezclado pero fijo, para que al volver a abrir salga igual.
const items = res.ollama.resumenes.filter((r) => !r.error)
  .map((r, i) => ({ r, k: Math.sin(i * 9301 + 49297) }))
  .sort((a, b) => a.k - b.k)
  .map(({ r }, i) => ({ id: r.id, numero: i + 1, archivo: r.archivo, documento: textos.get(r.archivo) ?? "", resumen: r.texto }));

if (items.length === 0) { console.error("La última corrida no tiene resúmenes de Ollama. Abre Ollama y ejecuta npm run banco."); process.exit(1); }

const leerCuerpo = (req: Connect.IncomingMessage) => new Promise<string>((ok) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => ok(s)); });

let cerrar: () => void = () => {};
const api: Connect.NextHandleFunction = async (req, res2, next) => {
  const url = req.url ?? "";
  if (url === "/api/resumenes") {
    res2.setHeader("content-type", "application/json");
    res2.end(JSON.stringify({ items, notas: cal }));
  } else if (url === "/api/calificar" && req.method === "POST") {
    const { id, nota } = JSON.parse(await leerCuerpo(req)) as { id: string; nota: number };
    if (items.some((i) => i.id === id) && nota >= 1 && nota <= 5) {
      cal[id] = nota;
      writeFileSync(rutaCal, JSON.stringify(cal, null, 2));
      escribirInforme(dir, RESULTADOS, umbrales);
    }
    res2.end("ok");
  } else if (url === "/api/terminar" && req.method === "POST") {
    res2.end("ok");
    setTimeout(() => cerrar(), 300);
  } else if (url === "/informe") {
    res2.setHeader("content-type", "text/html; charset=utf-8");
    res2.end(readFileSync(join(RESULTADOS, "informe.html")));
  } else next();
};

const { server, url } = await iniciarServidor(join(BENCH, "calificar"), pluginMotores(null, [api]));
cerrar = () => {
  const { resumen, html } = escribirInforme(dir, RESULTADOS, umbrales);
  console.log("\nCalificaciones guardadas. Resumen del informe:");
  for (const r of resumen) console.log(`  ${r.pasa === null ? "PENDIENTE" : r.pasa ? "PASA     " : "NO PASA  "}  ${r.que}`);
  console.log(`\nInforme: ${html}`);
  abrir(html);
  void server.close().then(() => process.exit(0));
};
console.log(`\nAbriendo la página para calificar: ${url}`);
console.log(`Son ${items.length} resúmenes. Puedes cerrar y seguir otro día: lo calificado queda guardado.`);
console.log("Para salir sin terminar, cierra esta ventana o pulsa Control + C.\n");
abrir(url);
