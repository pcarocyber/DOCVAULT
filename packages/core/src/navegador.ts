/**
 * Partes de packages/core que necesitan el navegador:
 * extraer texto de PDF (pdf.js), OCR (Tesseract.js) y embeddings (Transformers.js).
 * Las rutas de los archivos de cada motor se pasan desde fuera, para servirlos
 * desde el propio equipo y no depender de servidores externos.
 */
import * as pdfjs from "pdfjs-dist";
import { createWorker, type Worker as TesseractWorker } from "tesseract.js";

export interface RutasMotores {
  pdfWorker: string;      // URL de pdf.worker.min.mjs
  tesseractWorker: string;
  tesseractCore: string;  // carpeta con tesseract-core*.wasm.js
  tesseractIdiomas: string; // carpeta con spa.traineddata.gz y eng.traineddata.gz
  ortWasm: string;        // carpeta con los .wasm de onnxruntime-web
}

let rutas: RutasMotores | null = null;
export function configurarMotores(r: RutasMotores): void {
  rutas = r;
  pdfjs.GlobalWorkerOptions.workerSrc = r.pdfWorker;
}
function r(): RutasMotores {
  if (!rutas) throw new Error("Llama primero a configurarMotores()");
  return rutas;
}

// ---------- PDF ----------

export interface TextoPdf { texto: string; paginas: number; segundos: number }

export async function extraerTextoPdf(bytes: Uint8Array): Promise<TextoPdf> {
  r();
  const t0 = performance.now();
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const partes: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p);
    const contenido = await pagina.getTextContent();
    let linea = "";
    for (const item of contenido.items) {
      if (!("str" in item)) continue;
      linea += item.str;
      if (item.hasEOL) { partes.push(linea); linea = ""; }
    }
    if (linea) partes.push(linea);
    partes.push("");
  }
  const paginas = pdf.numPages;
  await pdf.destroy();
  return { texto: partes.join("\n").trim(), paginas, segundos: (performance.now() - t0) / 1000 };
}

/** Convierte cada página de un PDF escaneado en imagen para pasarla por OCR. */
export async function pdfAImagenes(bytes: Uint8Array, escala = 3): Promise<Blob[]> {
  r();
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const out: Blob[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p);
    const vista = pagina.getViewport({ scale: escala });
    const lienzo = new OffscreenCanvas(Math.ceil(vista.width), Math.ceil(vista.height));
    const ctx = lienzo.getContext("2d")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await pagina.render({ canvasContext: ctx as any, viewport: vista }).promise;
    out.push(await lienzo.convertToBlob({ type: "image/png" }));
  }
  await pdf.destroy();
  return out;
}

// ---------- OCR ----------

export interface ResultadoOcr { texto: string; confianza: number; segundos: number }

export class MotorOcr {
  private constructor(private worker: TesseractWorker, readonly segundosInicio: number) {}

  /** Carga Tesseract con español e inglés. */
  static async crear(idiomas = ["spa", "eng"]): Promise<MotorOcr> {
    const t0 = performance.now();
    const worker = await createWorker(idiomas, 1, {
      workerPath: r().tesseractWorker,
      corePath: r().tesseractCore,
      langPath: r().tesseractIdiomas,
      gzip: true,
    });
    return new MotorOcr(worker, (performance.now() - t0) / 1000);
  }

  async reconocer(imagen: Blob): Promise<ResultadoOcr> {
    const t0 = performance.now();
    const { data } = await this.worker.recognize(imagen);
    return { texto: data.text, confianza: data.confidence / 100, segundos: (performance.now() - t0) / 1000 };
  }

  async terminar(): Promise<void> { await this.worker.terminate(); }
}

// ---------- Embeddings ----------

export type Embedder = (textos: string[]) => Promise<number[][]>;

/**
 * Carga un modelo de embeddings multilingüe con Transformers.js.
 * La primera vez lo descarga (unos 120 MB) y el navegador lo guarda en caché.
 * Si `carpetaLocal` tiene el modelo, se usa sin descargar nada.
 */
export async function crearEmbedder(
  modelo = "Xenova/multilingual-e5-small",
  carpetaLocal?: string,
): Promise<{ embed: Embedder; segundosCarga: number }> {
  const t0 = performance.now();
  const tf = await import("@huggingface/transformers");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onnx = (tf.env.backends as any).onnx;
  onnx.wasm.wasmPaths = r().ortWasm;
  if (carpetaLocal) {
    tf.env.allowLocalModels = true;
    tf.env.allowRemoteModels = false;
    tf.env.localModelPath = carpetaLocal;
  } else {
    tf.env.allowLocalModels = false;
  }
  const extractor = await tf.pipeline("feature-extraction", modelo, { dtype: "q8", device: "wasm" });
  const esE5 = /e5/i.test(modelo);
  const embed: Embedder = async (textos) => {
    const entrada = textos.map((t) => (esE5 ? `query: ${t}` : t));
    const salida = await extractor(entrada, { pooling: "mean", normalize: true });
    return salida.tolist() as number[][];
  };
  return { embed, segundosCarga: (performance.now() - t0) / 1000 };
}
