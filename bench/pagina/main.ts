/**
 * Página que corre dentro de Chrome. Usa el código real de packages/core y
 * packages/indice sobre los 30 documentos y devuelve los datos crudos al
 * programa de Node (bench/correr.ts), que los compara con la clave.
 */
import { sha256, textoCarpeta, type Categoria } from "@docvault/core";
import {
  configurarMotores, extraerTextoPdf, pdfAImagenes, MotorOcr, crearEmbedder,
} from "@docvault/core/navegador";
import { Indice } from "@docvault/indice";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export interface ConfigPagina {
  documentos: string[];
  categorias: Categoria[];
  modeloEmbeddings: string;
  modeloLocal: boolean;
  escalaPdf: number;
  minimoCaracteresPdf: number;
  indice: { total: number; consultas: string[] };
}

function avisar(msg: string) {
  console.log(`[banco] ${msg}`);
  document.getElementById("estado")!.textContent = msg;
}

async function correr(cfg: ConfigPagina) {
  configurarMotores({
    pdfWorker,
    tesseractWorker: "/motores/tesseract/worker.min.js",
    tesseractCore: "/motores/tesseract-core",
    tesseractIdiomas: "/motores/tessdata",
    ortWasm: "/motores/ort/",
  });

  // 1. Extraer texto (PDF digital) u OCR (fotos y escaneos)
  avisar("Cargando el OCR (español e inglés)…");
  const ocr = await MotorOcr.crear();
  const documentos = [];
  for (const [i, archivo] of cfg.documentos.entries()) {
    avisar(`Documento ${i + 1} de ${cfg.documentos.length}: ${archivo}`);
    const bytes = new Uint8Array(await (await fetch(`/datos/${archivo}`)).arrayBuffer());
    const hash = await sha256(bytes);
    const esPdf = archivo.toLowerCase().endsWith(".pdf");
    let metodo: "texto del PDF" | "OCR" = "OCR";
    let texto = "", paginas = 1, confianza = 1;
    const segundosPorPagina: number[] = [];
    let t0 = performance.now();
    if (esPdf) {
      const r = await extraerTextoPdf(bytes);
      paginas = r.paginas;
      if (r.texto.replace(/\s/g, "").length >= cfg.minimoCaracteresPdf) {
        metodo = "texto del PDF"; texto = r.texto; segundosPorPagina.push(r.segundos / r.paginas);
      }
    }
    if (metodo === "OCR") {
      t0 = performance.now();
      const imagenes = esPdf ? await pdfAImagenes(bytes, cfg.escalaPdf) : [new Blob([bytes], { type: "image/jpeg" })];
      const textos: string[] = []; const confs: number[] = [];
      for (const img of imagenes) {
        const r = await ocr.reconocer(img);
        textos.push(r.texto); confs.push(r.confianza); segundosPorPagina.push(r.segundos);
      }
      // el tiempo de convertir el PDF en imagen se suma a la primera página
      const total = (performance.now() - t0) / 1000;
      const suma = segundosPorPagina.reduce((a, b) => a + b, 0);
      segundosPorPagina[0] += Math.max(0, total - suma);
      texto = textos.join("\n\n"); paginas = imagenes.length;
      confianza = confs.reduce((a, b) => a + b, 0) / confs.length;
    }
    documentos.push({ archivo, hash, metodo, paginas, segundosPorPagina, confianza, texto, bytes: bytes.length });
  }
  const ocrInicio = ocr.segundosInicio;
  await ocr.terminar();

  // 2. Embeddings para sugerir carpeta
  let embeddings: Record<string, unknown>;
  try {
    avisar("Cargando el modelo de IA básica (la primera vez se descarga, unos 120 MB)…");
    const { embed, segundosCarga } = await crearEmbedder(cfg.modeloEmbeddings, cfg.modeloLocal ? "/modelos/" : undefined);
    avisar("Calculando embeddings…");
    const t = performance.now();
    const vecDocs: number[][] = [];
    for (const d of documentos) vecDocs.push((await embed([d.texto.slice(0, 1500)]))[0]);
    const segundosPorDocumento = (performance.now() - t) / 1000 / documentos.length;
    const vecNombre = await embed(cfg.categorias.map((c) => textoCarpeta(c, false)));
    const vecDescripcion = await embed(cfg.categorias.map((c) => textoCarpeta(c, true)));
    embeddings = { ok: true, segundosCarga, segundosPorDocumento, vecDocs, vecNombre, vecDescripcion };
  } catch (e) {
    embeddings = { ok: false, error: String(e) };
  }

  // 3. Índice y búsqueda
  let indice: Record<string, unknown>;
  try {
    avisar(`Indexando ${cfg.indice.total} documentos…`);
    let t = performance.now();
    const idx = await Indice.abrir();
    const segundosAbrir = (performance.now() - t) / 1000;
    const lote = documentos.map((d) => ({ id: d.archivo, titulo: d.texto.split("\n")[0] ?? "", texto: d.texto }));
    const azar = aleatorio(42);
    for (let i = lote.length; i < cfg.indice.total; i++) lote.push(documentoSintetico(i, azar));
    t = performance.now();
    idx.agregar(lote);
    const segundosAgregar = (performance.now() - t) / 1000;
    const consultas = cfg.indice.consultas.map((consulta) => {
      const t1 = performance.now();
      const r = idx.buscar(consulta, 10);
      return { consulta, segundos: (performance.now() - t1) / 1000, ids: r.map((h) => h.id) };
    });
    indice = { ok: true, documentos: idx.contar(), segundosAbrir, segundosAgregar, consultas };
    idx.cerrar();
  } catch (e) {
    indice = { ok: false, error: String(e) };
  }

  avisar("Listo. Volviendo al banco de pruebas…");
  return {
    navegador: navigator.userAgent, hilos: navigator.hardwareConcurrency,
    ocrSegundosInicio: ocrInicio, documentos, embeddings, indice,
  };
}

// Documentos de relleno para llegar a 1.000: texto con palabras inventadas,
// para que no compitan con los documentos reales en las búsquedas.
function aleatorio(semilla: number) {
  return () => {
    semilla |= 0; semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SILABAS = "ka lo mi nu pe ra si to vu ze bal cor dun fem gil hor jus kel mon nor pul quim ret sav tol ur vex wan yor zim".split(" ");
function documentoSintetico(i: number, azar: () => number) {
  const palabra = () => Array.from({ length: 2 + Math.floor(azar() * 3) }, () => SILABAS[Math.floor(azar() * SILABAS.length)]).join("");
  const n = 200 + Math.floor(azar() * 300);
  const texto = Array.from({ length: n }, (_, k) => (k % 12 === 11 ? `${palabra()}.` : palabra())).join(" ");
  return { id: `relleno_${String(i).padStart(4, "0")}`, titulo: `${palabra()} ${palabra()}`.toUpperCase(), texto };
}

(window as unknown as { banco: unknown }).banco = { correr };
avisar("Página lista.");
