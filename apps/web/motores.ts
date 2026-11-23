/**
 * Sirve los archivos del OCR (Tesseract) y del motor de IA básica (onnxruntime)
 * desde el propio equipo, en /motores/.
 * Al programar los toma de node_modules; al construir los copia a dist/motores,
 * así estos motores nunca se descargan de servidores externos. El modelo de IA
 * básica se sirve desde bench/modelos si está; si no, la app lo baja una vez de
 * Hugging Face (ver src/sugerir.ts).
 */
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);

function paquete(nombre: string): string {
  let dir = dirname(require.resolve(nombre));
  while (dir !== dirname(dir)) {
    const pj = join(dir, "package.json");
    if (existsSync(pj) && (JSON.parse(readFileSync(pj, "utf8")) as { name?: string }).name === nombre) return dir;
    dir = dirname(dir);
  }
  throw new Error(`No encuentro el paquete ${nombre}. Ejecuta npm install.`);
}

/** Ruta publicada → archivo en node_modules. */
function archivos(): Record<string, string> {
  const core = paquete("tesseract.js-core");
  const out: Record<string, string> = {
    "motores/tesseract/worker.min.js": join(paquete("tesseract.js"), "dist", "worker.min.js"),
  };
  // Tesseract elige la versión con o sin SIMD según el procesador; con OCR LSTM usa estas dos.
  for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"]) {
    out[`motores/tesseract-core/${f}`] = join(core, f);
  }
  // onnxruntime-web: el motor que corre el modelo de IA básica (sugerir carpeta).
  const ort = join(paquete("onnxruntime-web"), "dist");
  for (const f of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]) {
    out[`motores/ort/${f}`] = join(ort, f);
  }
  for (const idioma of ["spa", "eng"]) {
    out[`motores/tessdata/${idioma}.traineddata.gz`] =
      join(paquete(`@tesseract.js-data/${idioma}`), "4.0.0_best_int", `${idioma}.traineddata.gz`);
  }
  return out;
}

/** Copia local del modelo de IA básica, si existe (la deja el banco de pruebas de la fase 0). */
const MODELOS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "bench", "modelos");

/** Sirve /modelos/… desde bench/modelos, si está, para no bajar el modelo de internet. */
function servirModelos(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = decodeURIComponent((req.url ?? "").split("?")[0]!);
  if (!url.startsWith("/modelos/")) return next();
  const archivo = normalize(join(MODELOS, url.slice("/modelos/".length)));
  if (!archivo.startsWith(MODELOS) || !existsSync(archivo) || !statSync(archivo).isFile()) {
    res.statusCode = 404; res.end(); return;
  }
  res.setHeader("Content-Type", archivo.endsWith(".json") ? "application/json" : "application/octet-stream");
  createReadStream(archivo).pipe(res);
}

export function motores(): Plugin {
  let salida = "dist";
  return {
    name: "docvault-motores",
    configResolved(c) { salida = c.build.outDir; },
    configureServer(server) {
      const mapa = archivos();
      server.middlewares.use((req, res, next) => {
        const ruta = (req.url ?? "").split("?")[0]!.replace(/^\//, "");
        const archivo = mapa[ruta];
        if (!archivo) return next();
        res.setHeader("Content-Type", /\.m?js$/.test(ruta) ? "text/javascript" : ruta.endsWith(".wasm") ? "application/wasm" : "application/octet-stream");
        createReadStream(archivo).pipe(res);
      });
      server.middlewares.use(servirModelos);
    },
    configurePreviewServer(server) {
      server.middlewares.use(servirModelos);
    },
    closeBundle() {
      for (const [ruta, archivo] of Object.entries(archivos())) {
        const destino = join(salida, ruta);
        mkdirSync(dirname(destino), { recursive: true });
        copyFileSync(archivo, destino);
      }
    },
  };
}
