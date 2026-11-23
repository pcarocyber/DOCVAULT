import { existsSync, readFileSync, mkdirSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export const BENCH = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const RAIZ = resolve(BENCH, "..");
export const RESULTADOS = join(BENCH, "resultados");
export const PERFIL_NAVEGADOR = join(BENCH, ".navegador");
export const MODELOS_LOCALES = join(BENCH, "modelos");
const require = createRequire(import.meta.url);

/** Carpeta con los 30 documentos: bench/datos/documentos-prueba o bench/datos. */
export function carpetaDatos(): string | null {
  for (const c of [join(BENCH, "datos", "documentos-prueba"), join(BENCH, "datos")]) {
    if (existsSync(join(c, "respuestas", "clave.json"))) return c;
  }
  return null;
}

/** Carpeta de un paquete instalado en node_modules. */
/** Si los documentos no están descomprimidos pero hay un .zip en bench/datos, lo descomprime. */
export function prepararDatos(): string | null {
  const ya = carpetaDatos();
  if (ya) return ya;
  const dir = join(BENCH, "datos");
  const zip = existsSync(dir) ? readdirSync(dir).find((f) => f.toLowerCase().endsWith(".zip")) : undefined;
  if (!zip) return null;
  console.log(`  Descomprimiendo ${zip}…`);
  execSync(process.platform === "win32"
    ? `powershell -NoProfile -Command "Expand-Archive -Force '${join(dir, zip)}' '${dir}'"`
    : `unzip -oq "${join(dir, zip)}" -d "${dir}"`);
  return carpetaDatos();
}

export function paquete(nombre: string): string {
  let dir = dirname(require.resolve(nombre));
  while (dir !== dirname(dir)) {
    const pj = join(dir, "package.json");
    if (existsSync(pj) && (JSON.parse(readFileSync(pj, "utf8")) as { name?: string }).name === nombre) return dir;
    dir = dirname(dir);
  }
  throw new Error(`No encuentro el paquete ${nombre}. Ejecuta npm install.`);
}

export function leerJson<T>(ruta: string): T {
  return JSON.parse(readFileSync(ruta, "utf8")) as T;
}

export function asegurarCarpeta(ruta: string): string {
  mkdirSync(ruta, { recursive: true });
  return ruta;
}
