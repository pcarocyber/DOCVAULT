/**
 * Estampar el código del documento: una franja al pie de la primera página con
 * el QR, el código de barras (Code 128) y el código escrito (DV-000123).
 * La página se alarga hacia abajo para hacer espacio: la franja nunca tapa el
 * contenido. Todo se hace en el navegador; el archivo original no se toca.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import qrcode from "qrcode-generator";
import { code128 } from "@docvault/core";

/** Alto de la franja en puntos (72 por pulgada): unos 3,2 cm. */
const FRANJA = 90;
/** Margen que muchas impresoras no imprimen (borde de la hoja): ahí no se dibuja nada. */
const BORDE = 22;
/** En las demás páginas, una línea pequeña con el código. */
const LINEA = 32;
const NEGRO = rgb(0.08, 0.09, 0.12);
const GRIS = rgb(0.38, 0.41, 0.46);

const IMAGENES_DIRECTAS = new Set(["jpg", "jpeg", "png"]);
const IMAGENES_CONVERTIBLES = new Set(["webp", "gif", "bmp"]);

/** ¿Se puede descargar este tipo de archivo con el código estampado? */
export function sePuedeEstampar(tipo: string | null | undefined): boolean {
  const t = tipo ?? "";
  return t === "pdf" || IMAGENES_DIRECTAS.has(t) || IMAGENES_CONVERTIBLES.has(t);
}

/** Dibuja el QR con su esquina inferior izquierda en (x, y) y lado `lado`. */
function dibujarQr(page: PDFPage, texto: string, x: number, y: number, lado: number) {
  const qr = qrcode(0, "M");
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  const m = lado / (n + 4); // 2 módulos de margen blanco a cada lado
  page.drawRectangle({ x, y, width: lado, height: lado, color: rgb(1, 1, 1) });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      let largo = 1;
      while (c + largo < n && qr.isDark(r, c + largo)) largo++;
      page.drawRectangle({ x: x + (c + 2) * m, y: y + lado - (r + 3) * m, width: largo * m, height: m, color: NEGRO });
      c += largo - 1;
    }
  }
}

/** Dibuja el Code 128 con su esquina inferior izquierda en (x, y). Devuelve el ancho. */
function dibujarBarras(page: PDFPage, texto: string, x: number, y: number, alto: number, modulo: number): number {
  const { barras, ancho } = code128(texto);
  page.drawRectangle({ x, y, width: ancho * modulo, height: alto, color: rgb(1, 1, 1) });
  for (const b of barras) page.drawRectangle({ x: x + b.x * modulo, y, width: b.ancho * modulo, height: alto, color: NEGRO });
  return ancho * modulo;
}

/** La franja completa, en un rectángulo que empieza en (x, y) con el ancho dado. */
function dibujarFranja(page: PDFPage, codigo: string, x: number, y: number, ancho: number, negrita: PDFFont, normal: PDFFont) {
  page.drawRectangle({ x, y, width: ancho, height: FRANJA, color: rgb(1, 1, 1) });
  page.drawLine({ start: { x: x + BORDE, y: y + FRANJA - 4 }, end: { x: x + ancho - BORDE, y: y + FRANJA - 4 }, thickness: 0.5, color: GRIS, dashArray: [3, 3] });
  const lado = FRANJA - BORDE - 8;
  dibujarQr(page, codigo, x + BORDE, y + BORDE, lado);
  const xb = x + BORDE + lado + 14;
  const anchoBarras = dibujarBarras(page, codigo, xb, y + BORDE + 16, lado - 18, 1);
  page.drawText(codigo, { x: xb + 10, y: y + BORDE + 3, size: 11, font: negrita, color: NEGRO });
  const xt = xb + anchoBarras + 16;
  if (xt + 90 < x + ancho) {
    page.drawText("DOCVAULT", { x: xt, y: y + BORDE + 34, size: 9, font: negrita, color: GRIS });
    page.drawText("Escanea el código o escríbelo", { x: xt, y: y + BORDE + 21, size: 8, font: normal, color: GRIS });
    page.drawText("en el buscador para abrirlo.", { x: xt, y: y + BORDE + 11, size: 8, font: normal, color: GRIS });
  }
}

/** Alarga la página hacia abajo `extra` puntos y devuelve dónde empieza el espacio nuevo. */
function alargar(page: PDFPage, extra: number): { x: number; y: number; ancho: number } {
  const mb = page.getMediaBox();
  const cb = page.getCropBox();
  page.setMediaBox(mb.x, mb.y - extra, mb.width, mb.height + extra);
  page.setCropBox(cb.x, cb.y - extra, cb.width, cb.height + extra);
  // Las demás cajas (corte, sangrado) se igualan para que ningún visor recorte la franja.
  page.setTrimBox(cb.x, cb.y - extra, cb.width, cb.height + extra);
  page.setBleedBox(cb.x, cb.y - extra, cb.width, cb.height + extra);
  return { x: cb.x, y: cb.y - extra, ancho: cb.width };
}

async function bytesDeImagen(archivo: File, tipo: string): Promise<{ bytes: Uint8Array; png: boolean }> {
  if (IMAGENES_DIRECTAS.has(tipo)) return { bytes: new Uint8Array(await archivo.arrayBuffer()), png: tipo === "png" };
  const bmp = await createImageBitmap(archivo);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  return { bytes: new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer()), png: true };
}

/** Un PDF con el documento y su código estampado. */
export async function estampar(archivo: File, tipo: string, codigo: string): Promise<Uint8Array> {
  let pdf: PDFDocument;
  if (tipo === "pdf") {
    pdf = await PDFDocument.load(await archivo.arrayBuffer(), { ignoreEncryption: true });
  } else {
    // Una foto o un escaneo: se pone en una hoja tamaño carta, con márgenes.
    pdf = await PDFDocument.create();
    const { bytes, png } = await bytesDeImagen(archivo, tipo);
    const img = png ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([612, 792]);
    const margen = 36;
    const escala = Math.min((612 - 2 * margen) / img.width, (792 - 2 * margen) / img.height);
    const w = img.width * escala, h = img.height * escala;
    page.drawImage(img, { x: (612 - w) / 2, y: 792 - margen - h, width: w, height: h });
  }
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const paginas = pdf.getPages();
  paginas.forEach((page, i) => {
    if (i === 0) {
      const z = alargar(page, FRANJA);
      dibujarFranja(page, codigo, z.x, z.y, z.ancho, negrita, normal);
    } else {
      const z = alargar(page, LINEA);
      page.drawRectangle({ x: z.x, y: z.y, width: z.ancho, height: LINEA, color: rgb(1, 1, 1) });
      page.drawText(`${codigo} · página ${i + 1} de ${paginas.length}`, { x: z.x + BORDE, y: z.y + BORDE - 4, size: 8, font: normal, color: GRIS });
    }
  });
  pdf.setTitle(`${archivo.name} (${codigo})`);
  pdf.setProducer("DOCVAULT");
  return pdf.save();
}

/** Solo la etiqueta: 7 × 3 cm, para imprimir y pegar en el documento físico. */
export async function etiqueta(codigo: string, nombre: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([198, 85]);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  dibujarQr(page, codigo, 6, 8, 70);
  dibujarBarras(page, codigo, 80, 32, 34, 0.7);
  page.drawText(codigo, { x: 82, y: 18, size: 12, font: negrita, color: NEGRO });
  // Las fuentes estándar de PDF no tienen todos los caracteres: se deja solo lo que pueden escribir.
  let corto = [...nombre].map((c) => (normal.getCharacterSet().includes(c.charCodeAt(0)) ? c : "?")).join("");
  while (corto.length > 4 && normal.widthOfTextAtSize(corto, 6.5) > 110) corto = corto.slice(0, -2) + "…";
  try { page.drawText(corto, { x: 82, y: 8, size: 6.5, font: normal, color: GRIS }); } catch { /* sin nombre */ }
  pdf.setTitle(`Etiqueta ${codigo}`);
  pdf.setProducer("DOCVAULT");
  return pdf.save();
}

/** Nombre de archivo sin acentos: algunos Chrome cambian por "download" un nombre fuera del ASCII. */
export function nombreSeguro(nombre: string): string {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/[\\/:*?"<>|]/g, "_");
}

export function nombreConCodigo(nombre: string, codigo: string): string {
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  return nombreSeguro(`${base} ${codigo}.pdf`);
}

export function descargar(bytes: Uint8Array, nombre: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Abre el cuadro de imprimir de Chrome con este PDF, sin cambiar de pestaña:
 * el PDF se carga en un marco invisible y se imprime desde ahí.
 */
export function imprimirAqui(bytes: Uint8Array): Promise<void> {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
  const marco = document.createElement("iframe");
  marco.title = "Documento para imprimir";
  marco.setAttribute("aria-hidden", "true");
  // Chrome no imprime un marco de tamaño cero: queda de 1 px y transparente.
  marco.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  document.querySelector("iframe[data-imprimir]")?.remove();
  marco.dataset.imprimir = "";
  return new Promise((ok, mal) => {
    // Si el visor de PDF no carga (por ejemplo, Chrome configurado para descargar los PDF), se avisa.
    const espera = setTimeout(() => { marco.remove(); mal(new Error("el PDF no cargó para imprimir")); }, 10_000);
    marco.onload = () => {
      clearTimeout(espera);
      // El visor de PDF termina de cargar un poco después del evento load.
      setTimeout(() => {
        try { marco.contentWindow!.focus(); marco.contentWindow!.print(); ok(); }
        catch (e) { mal(e); }
        setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
      }, 400);
    };
    marco.src = url;
    document.body.append(marco);
  });
}

/**
 * Abre una pestaña nueva ya (antes de esperar nada, para que Chrome no la bloquee)
 * y le pone el PDF cuando está listo. Si algo falla, abre `respaldo`.
 */
export async function abrirEnPestana(preparar: () => Promise<Uint8Array>, respaldo?: () => Promise<Blob>): Promise<boolean> {
  const w = window.open("", "_blank");
  if (!w) return false;
  try { w.document.title = "Preparando…"; w.document.body.textContent = "Preparando el documento con su código…"; } catch { /* nada */ }
  let blob: Blob;
  try { blob = new Blob([(await preparar()) as Uint8Array<ArrayBuffer>], { type: "application/pdf" }); }
  catch (e) { if (!respaldo) { w.close(); throw e; } blob = await respaldo(); }
  const url = URL.createObjectURL(blob);
  w.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  return true;
}

/** Abre el PDF en una pestaña nueva, listo para imprimir (Cmd + P o el botón de imprimir de Chrome). */
export function abrirParaImprimir(bytes: Uint8Array): boolean {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
  const w = window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  return !!w;
}
