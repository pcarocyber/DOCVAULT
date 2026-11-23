/**
 * Texto de documentos de Office modernos (.docx y .xlsx).
 * Ambos son archivos ZIP con XML adentro; se leen sin servidor y sin
 * depender del navegador, así que también corren en las pruebas con Node.
 * Los formatos viejos (.doc y .xls) no se leen.
 */
import { unzipSync, strFromU8 } from "fflate";

const MAX_TEXTO = 1_000_000;

function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function abrirZip(bytes: Uint8Array, filtro: (nombre: string) => boolean): Record<string, string> {
  const archivos = unzipSync(bytes, { filter: (f) => filtro(f.name) });
  const out: Record<string, string> = {};
  for (const [nombre, datos] of Object.entries(archivos)) out[nombre] = strFromU8(datos);
  return out;
}

/** Texto de un .docx: cuerpo, encabezados, pies y notas, un párrafo por línea. */
export function extraerTextoDocx(bytes: Uint8Array): string {
  const partes = abrirZip(bytes, (n) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n));
  const orden = Object.keys(partes).sort((a, b) => (a === "word/document.xml" ? -1 : b === "word/document.xml" ? 1 : a.localeCompare(b)));
  const lineas: string[] = [];
  for (const nombre of orden) {
    const xml = partes[nombre]!;
    for (const parrafo of xml.split(/<\/w:p>/)) {
      let linea = "";
      for (const m of parrafo.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
        linea += m[1] !== undefined ? desescapar(m[1]) : m[0] === "<w:tab/>" ? "\t" : "\n";
      }
      if (linea.trim()) lineas.push(linea);
    }
  }
  return lineas.join("\n").slice(0, MAX_TEXTO);
}

/** Texto de un .xlsx: cada hoja con su nombre y luego sus filas, celdas separadas por tabulador. */
export function extraerTextoXlsx(bytes: Uint8Array): string {
  const partes = abrirZip(bytes, (n) => n === "xl/sharedStrings.xml" || n === "xl/workbook.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const compartidas = [...(partes["xl/sharedStrings.xml"] ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => [...m[1]!.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((t) => desescapar(t[1]!)).join(""));
  const nombresHojas = [...(partes["xl/workbook.xml"] ?? "").matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) => desescapar(m[1]!));
  const hojas = Object.keys(partes)
    .filter((n) => n.startsWith("xl/worksheets/"))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));

  const lineas: string[] = [];
  for (const [i, hoja] of hojas.entries()) {
    if (nombresHojas[i]) lineas.push(nombresHojas[i]!);
    for (const fila of partes[hoja]!.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const celdas: string[] = [];
      for (const c of fila[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1] ?? "";
        const cuerpo = c[2] ?? "";
        const tipo = attrs.match(/\bt="([^"]+)"/)?.[1];
        let valor = "";
        if (tipo === "inlineStr") {
          valor = [...cuerpo.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((t) => desescapar(t[1]!)).join("");
        } else {
          const v = cuerpo.match(/<v>([^<]*)<\/v>/)?.[1];
          if (v !== undefined) valor = tipo === "s" ? (compartidas[Number(v)] ?? "") : desescapar(v);
        }
        if (valor) celdas.push(valor);
      }
      if (celdas.length) lineas.push(celdas.join("\t"));
    }
  }
  return lineas.join("\n").slice(0, MAX_TEXTO);
}
