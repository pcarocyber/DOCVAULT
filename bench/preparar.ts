/**
 * npm run preparar
 * Revisa que todo esté listo y descarga lo que falte:
 * documentos de prueba, navegador y modelos de Ollama.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { BENCH, carpetaDatos, leerJson } from "./lib/rutas";
import { abrirNavegador } from "./lib/navegador";
import { URL_OLLAMA, modelosInstalados, estaInstalado } from "./pruebas/resumen";
import type { Config } from "./lib/tipos";

const ok = (m: string) => console.log(`  [listo]  ${m}`);
const falta = (m: string) => console.log(`  [falta]  ${m}`);
let todoListo = true;

console.log("\n== Preparando el banco de pruebas de DOCVAULT ==\n");

// 1. Node
const mayor = Number(process.versions.node.split(".")[0]);
if (mayor >= 20) ok(`Node.js ${process.versions.node}`);
else { falta(`Node.js ${process.versions.node} es viejo: instala la versión 20 o más nueva desde nodejs.org`); todoListo = false; }

// 2. Documentos de prueba
let datos = carpetaDatos();
if (!datos) {
  const dirDatos = join(BENCH, "datos");
  const zip = readdirSync(dirDatos).find((f) => f.toLowerCase().endsWith(".zip"));
  if (zip) {
    console.log(`  Descomprimiendo ${zip}…`);
    execSync(process.platform === "win32"
      ? `powershell -NoProfile -Command "Expand-Archive -Force '${join(dirDatos, zip)}' '${dirDatos}'"`
      : `unzip -oq "${join(dirDatos, zip)}" -d "${dirDatos}"`);
    datos = carpetaDatos();
  }
}
if (datos) ok(`Documentos de prueba en ${datos}`);
else { falta("Documentos de prueba: copia documentos-prueba.zip dentro de bench/datos y vuelve a ejecutar npm run preparar"); todoListo = false; }

// 3. Navegador
try {
  const nav = await abrirNavegador();
  await nav.contexto.close();
  ok(`Navegador: ${nav.nombre} ${nav.version}`);
} catch {
  console.log("  No encontré Chrome ni Edge. Descargando el navegador de pruebas (unos 150 MB)…");
  try {
    execSync("npx playwright install chromium", { stdio: "inherit" });
    ok("Navegador de pruebas instalado");
  } catch {
    falta("Navegador: instala Google Chrome y vuelve a intentar"); todoListo = false;
  }
}

// 4. Ollama y sus modelos
const config = leerJson<Config>(join(BENCH, "config.json"));
const instalados = await modelosInstalados();
if (!instalados) {
  falta("Ollama no responde. Instálalo desde ollama.com, ábrelo (aparece una llama en la barra de menú) y vuelve a ejecutar npm run preparar");
  todoListo = false;
} else {
  ok("Ollama está abierto");
  for (const modelo of config.modelos_ollama) {
    if (estaInstalado(instalados, modelo)) { ok(`Modelo ${modelo}`); continue; }
    console.log(`  Descargando el modelo ${modelo} (puede ser de 2 a 5 GB, tarda según tu internet)…`);
    const r = await fetch(`${URL_OLLAMA}/api/pull`, { method: "POST", body: JSON.stringify({ model: modelo, stream: true }) });
    const lector = r.body!.getReader();
    const dec = new TextDecoder();
    let ultimo = -1, error = "", resto = "";
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      resto += dec.decode(value, { stream: true });
      const lineas = resto.split("\n"); resto = lineas.pop() ?? "";
      for (const l of lineas.filter(Boolean)) {
        const j = JSON.parse(l) as { status?: string; total?: number; completed?: number; error?: string };
        if (j.error) error = j.error;
        if (j.total && j.completed) {
          const p = Math.floor((j.completed / j.total) * 100);
          if (p >= ultimo + 10) { ultimo = p; process.stdout.write(`    ${p}%\n`); }
        }
      }
    }
    if (error) { falta(`Modelo ${modelo}: ${error}`); todoListo = false; }
    else ok(`Modelo ${modelo} descargado`);
  }
}

console.log(todoListo
  ? "\nTodo listo. Ahora ejecuta: npm run banco\n"
  : "\nFalta algo de la lista de arriba. Cuando lo arregles, vuelve a ejecutar: npm run preparar\n");
process.exitCode = todoListo ? 0 : 1;
