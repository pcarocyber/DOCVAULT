/**
 * Texto de documentos de Office modernos (.docx y .xlsx), y un escritor de .xlsx sencillo.
 * Ambos son archivos ZIP con XML adentro; se leen sin servidor y sin
 * depender del navegador, así que también corren en las pruebas con Node.
 * Los formatos viejos (.doc y .xls) no se leen.
 */
import { unzipSync, strFromU8, strToU8, zipSync } from "fflate";

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

// ---------- Escribir un .xlsx ----------

export type Celda = string | number | null;
export interface Hoja { nombre: string; filas: Celda[][]; anchos?: number[] }

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    // XML no admite caracteres de control
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function columna(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * Crea un libro de Excel (.xlsx) sencillo: texto en línea y números, la primera
 * fila en negrita y fija al desplazarse. Lo abren Excel, Numbers y LibreOffice.
 */
export function crearXlsx(hojas: Hoja[]): Uint8Array {
  const hojaXml = (h: Hoja) => {
    const filas = h.filas.map((fila, r) => {
      const celdas = fila.map((v, c) => {
        if (v === null || v === "") return "";
        const ref = `${columna(c)}${r + 1}`;
        const estilo = r === 0 ? ' s="1"' : "";
        return typeof v === "number" && Number.isFinite(v)
          ? `<c r="${ref}"${estilo}><v>${v}</v></c>`
          : `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${escapar(String(v))}</t></is></c>`;
      }).join("");
      return `<row r="${r + 1}">${celdas}</row>`;
    }).join("");
    const cols = h.anchos?.length
      ? `<cols>${h.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
      : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${filas}</sheetData></worksheet>`;
  };
  const archivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${escapar(h.nombre.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
  };
  hojas.forEach((h, i) => { archivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(hojaXml(h)); });
  return zipSync(archivos);
}
