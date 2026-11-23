/**
 * Sirve los archivos del OCR (Tesseract) desde el propio equipo, en /motores/.
 * Al programar los toma de node_modules; al construir los copia a dist/motores,
 * así la app nunca descarga nada de servidores externos.
 */
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
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
  for (const idioma of ["spa", "eng"]) {
    out[`motores/tessdata/${idioma}.traineddata.gz`] =
      join(paquete(`@tesseract.js-data/${idioma}`), "4.0.0_best_int", `${idioma}.traineddata.gz`);
  }
  return out;
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
        res.setHeader("Content-Type", ruta.endsWith(".js") ? "text/javascript" : "application/octet-stream");
        createReadStream(archivo).pipe(res);
      });
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
