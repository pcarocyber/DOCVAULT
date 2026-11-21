/**
 * Servidor local (Vite) que sirve la página del banco, los documentos y los
 * archivos de los motores (OCR, IA) desde node_modules, sin usar internet.
 * Solo escucha en 127.0.0.1: nadie más en la red puede verlo.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer, type Plugin, type ViteDevServer, type Connect } from "vite";
import { BENCH, RAIZ, MODELOS_LOCALES, paquete } from "./rutas";

const TIPOS: Record<string, string> = {
  ".wasm": "application/wasm", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".gz": "application/octet-stream", ".onnx": "application/octet-stream",
  ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".txt": "text/plain; charset=utf-8", ".csv": "text/csv; charset=utf-8",
};

function servirCarpeta(prefijo: string, carpeta: () => string): Connect.NextHandleFunction {
  return (req, res, next) => {
    const url = decodeURIComponent((req.url ?? "").split("?")[0]);
    if (!url.startsWith(prefijo)) return next();
    const base = carpeta();
    const ruta = normalize(join(base, url.slice(prefijo.length)));
    if (!ruta.startsWith(base) || !existsSync(ruta) || !statSync(ruta).isFile()) {
      res.statusCode = 404; res.end("no encontrado"); return;
    }
    res.setHeader("content-type", TIPOS[extname(ruta).toLowerCase()] ?? "application/octet-stream");
    res.setHeader("cross-origin-resource-policy", "same-origin");
    createReadStream(ruta).pipe(res);
  };
}

function idiomasTesseract(): Connect.NextHandleFunction {
  // /motores/tessdata/spa.traineddata.gz -> @tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz
  return (req, res, next) => {
    const m = (req.url ?? "").match(/^\/motores\/tessdata\/([a-z_]+)\.traineddata\.gz/);
    if (!m) return next();
    const ruta = join(paquete(`@tesseract.js-data/${m[1]}`), "4.0.0_best_int", `${m[1]}.traineddata.gz`);
    if (!existsSync(ruta)) { res.statusCode = 404; res.end(); return; }
    res.setHeader("content-type", "application/octet-stream");
    createReadStream(ruta).pipe(res);
  };
}

export function pluginMotores(datos: string | null, extra: Connect.NextHandleFunction[] = []): Plugin {
  return {
    name: "docvault-motores",
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        // Permite que la IA use varios hilos del procesador.
        res.setHeader("cross-origin-opener-policy", "same-origin");
        res.setHeader("cross-origin-embedder-policy", "credentialless");
        next();
      });
      for (const h of extra) server.middlewares.use(h);
      if (datos) server.middlewares.use(servirCarpeta("/datos/", () => datos));
      server.middlewares.use(servirCarpeta("/motores/tesseract/", () => join(paquete("tesseract.js"), "dist")));
      server.middlewares.use(servirCarpeta("/motores/tesseract-core/", () => paquete("tesseract.js-core")));
      server.middlewares.use(servirCarpeta("/motores/ort/", () => join(paquete("onnxruntime-web"), "dist")));
      server.middlewares.use(servirCarpeta("/modelos/", () => MODELOS_LOCALES));
      server.middlewares.use(idiomasTesseract());
    },
  };
}

export async function iniciarServidor(raizPagina: string, plugin: Plugin): Promise<{ server: ViteDevServer; url: string }> {
  const server = await createServer({
    configFile: false,
    root: raizPagina,
    logLevel: "error",
    clearScreen: false,
    plugins: [plugin],
    server: { host: "127.0.0.1", port: 0, strictPort: false, fs: { allow: [RAIZ, BENCH] } },
    optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm", "@huggingface/transformers"] },
    worker: { format: "es" },
  });
  await server.listen();
  const direccion = server.httpServer!.address();
  const puerto = typeof direccion === "object" && direccion ? direccion.port : 5173;
  return { server, url: `http://127.0.0.1:${puerto}/` };
}
