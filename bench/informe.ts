/** npm run informe — vuelve a armar el informe de la última corrida (por ejemplo, después de calificar). */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BENCH, RESULTADOS, leerJson } from "./lib/rutas";
import { escribirInforme } from "./lib/informe";
import { abrir } from "./lib/sistema";
import type { Umbrales } from "./lib/tipos";

const ultima = join(RESULTADOS, "ultima-corrida.txt");
if (!existsSync(ultima)) { console.error("Todavía no hay corridas. Ejecuta primero: npm run banco"); process.exit(1); }
const dir = join(RESULTADOS, readFileSync(ultima, "utf8").trim());
const { resumen, html } = escribirInforme(dir, RESULTADOS, leerJson<Umbrales>(join(BENCH, "umbrales.json")));
for (const r of resumen) console.log(`  ${r.pasa === null ? "PENDIENTE" : r.pasa ? "PASA     " : "NO PASA  "}  ${r.que}`);
console.log(`\nInforme: ${html}`);
if (!process.argv.includes("--sin-abrir")) abrir(html);
