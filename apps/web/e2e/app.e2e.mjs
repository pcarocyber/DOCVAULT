/**
 * Prueba de punta a punta de la app, en Chrome de verdad.
 * Crea una carpeta de prueba en el almacenamiento privado del navegador (OPFS),
 * se la da a la app, y revisa: indexa, lee Word y Excel, lee fotos y escaneos
 * con OCR, busca, muestra el texto, recuerda el índice al recargar, y se pone
 * al día cuando se agrega o se borra un archivo.
 * Uso: npm run e2e  (desde la raíz del repositorio)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Un PDF mínimo con una línea de texto (para no depender de archivos externos). */
function pdfConTexto(texto) {
  const contenido = `BT /F1 12 Tf 72 720 Td (${texto}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const pos = [];
  objs.forEach((o, i) => { pos.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

/** Archivos reales de e2e/datos (foto, escaneo, Word, Excel), en base64 para pasarlos al navegador. */
const datos = (n) => ({ base64: readFileSync(resolve(raiz, "e2e/datos", n)).toString("base64") });

const archivos = {
  "Contratos/arrendamiento local.pdf": pdfConTexto("Contrato de arrendamiento del local comercial, vence el 30 de junio de 2027. Arrendatario: Farmacia Nueva Aurora."),
  "Facturas/factura B0100004521.pdf": pdfConTexto("Factura de credito fiscal. Fecha limite de pago: 15 de diciembre de 2026. Total RD$ 30,208.00 por resmas de papel."),
  "notas.txt": "Póliza de seguro del vehículo: renovar en mayo.",
  "fotos/cedula.jpg": "no es una imagen real",
  "otros/planilla.xls": "formato viejo de Excel",
  "fotos/recibo.jpg": datos("recibo.jpg"),
  "Títulos/certificado escaneado.pdf": datos("escaneo.pdf"),
  "Vehículo/acto de venta.docx": datos("acto de venta.docx"),
  "otros/gastos.xlsx": datos("gastos.xlsx"),
  ".oculto/secreto.txt": "no debe aparecer",
};

const servidor = await preview({ root: raiz, preview: { port: 5199, strictPort: false }, logLevel: "error" });
const url = servidor.resolvedUrls.local[0];
const navegador = await chromium.launch();
const pagina = await navegador.newPage();
const errores = [];
pagina.on("pageerror", (e) => errores.push(e.message));

try {
  await pagina.goto(`${url}?pruebas`);
  await pagina.getByText("Elegir la carpeta de mis documentos").waitFor();

  // Crear la carpeta de prueba dentro de OPFS y dársela a la app.
  await pagina.evaluate(async (archivos) => {
    const opfs = await navigator.storage.getDirectory();
    const raiz = await opfs.getDirectoryHandle("Mis documentos", { create: true });
    for (const [ruta, contenido] of Object.entries(archivos)) {
      const partes = ruta.split("/");
      let dir = raiz;
      for (const p of partes.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
      const w = await (await dir.getFileHandle(partes.at(-1), { create: true })).createWritable();
      const bytes = typeof contenido === "string" ? contenido
        : Uint8Array.from(atob(contenido.base64), (c) => c.charCodeAt(0));
      await w.write(bytes); await w.close();
    }
    await window.__docvault.usarCarpeta(raiz);
  }, archivos);

  const estadoIndice = pagina.locator(".estado").filter({ hasText: "Índice al día" });
  await estadoIndice.waitFor({ timeout: 30_000 });
  assert.match(await estadoIndice.textContent(), /9 nuevos/, "deben indexarse 9 archivos (el oculto no)");
  assert.match(await pagina.locator("header").textContent(), /9 documentos/);

  // El OCR corre después, en segundo plano: foto, escaneo y una "foto" que no es imagen.
  const estadoOcr = pagina.locator(".estado").filter({ hasText: "Fotos y escaneos leídos" });
  await estadoOcr.waitFor({ timeout: 180_000 });
  assert.match(await estadoOcr.textContent(), /2 leídos.*1 no se pudieron leer/);
  console.log(`  OCR: ${(await estadoOcr.textContent()).trim()}`);

  const buscar = async (q) => {
    await pagina.getByLabel("Buscar").fill(q);
    await pagina.waitForTimeout(150);
    return pagina.locator(".docs .nombre").allTextContents();
  };
  assert.deepEqual(await buscar("arrendamiento"), ["arrendamiento local.pdf"], "busca en el texto del PDF");
  assert.deepEqual(await buscar("credito fiscal"), ["factura B0100004521.pdf"], "busca sin acentos");
  assert.deepEqual(await buscar("POLIZA"), ["notas.txt"], "busca en .txt sin mayúsculas ni acentos");
  assert.deepEqual(await buscar("cedula"), ["cedula.jpg"], "busca por nombre de archivo");
  assert.deepEqual(await buscar("Facturas"), ["factura B0100004521.pdf"], "busca por nombre de subcarpeta");
  assert.equal(await pagina.locator("mark").first().textContent(), "Facturas");
  assert.deepEqual(await buscar("secreto"), [], "no indexa archivos ocultos");
  assert.deepEqual(await buscar("alquiler octubre"), ["recibo.jpg"], "OCR de una foto");
  assert.deepEqual(await buscar("matricula parcela"), ["certificado escaneado.pdf"], "OCR de un PDF escaneado");
  assert.deepEqual(await buscar("toyota chasis"), ["acto de venta.docx"], "texto de Word");
  assert.deepEqual(await buscar("inversor"), ["gastos.xlsx"], "texto de Excel");

  // Ver el texto extraído de la foto.
  await buscar("recibo");
  await pagina.getByRole("button", { name: "Ver texto" }).first().click();
  const texto = await pagina.locator(".texto pre").textContent();
  assert.match(texto, /RECIBO DE PAGO/);
  assert.match(await pagina.locator(".texto .nota").textContent(), /Leído con OCR · confianza \d+ %/);
  await pagina.screenshot({ path: resolve(raiz, "e2e/captura-texto.png") });

  // Al recargar, la app recuerda la carpeta y el índice; nada que releer.
  await pagina.reload();
  await estadoIndice.waitFor({ timeout: 30_000 });
  assert.match(await estadoIndice.textContent(), /0 nuevos, 0 cambiados, 0 quitados, 9 sin cambios/);
  assert.deepEqual(await buscar("arrendamiento"), ["arrendamiento local.pdf"], "el índice se guardó en OPFS");
  assert.deepEqual(await buscar("matricula"), ["certificado escaneado.pdf"], "el OCR se guardó y no se repite");
  assert.equal(await pagina.locator(".avance").count(), 0, "no vuelve a pasar OCR a lo ya leído");

  // Agregar y borrar archivos, y actualizar.
  await pagina.evaluate(async (pdf) => {
    const raiz = await (await navigator.storage.getDirectory()).getDirectoryHandle("Mis documentos");
    const w = await (await raiz.getFileHandle("poder especial.pdf", { create: true })).createWritable();
    await w.write(pdf); await w.close();
    await raiz.removeEntry("notas.txt");
  }, pdfConTexto("Poder especial otorgado a la Lcda. Ana Ejemplo Batista."));
  await pagina.getByRole("button", { name: "Actualizar" }).click();
  await pagina.getByText(/1 nuevos, 0 cambiados, 1 quitados, 8 sin cambios/).waitFor({ timeout: 30_000 });
  assert.deepEqual(await buscar("poder"), ["poder especial.pdf"]);
  assert.deepEqual(await buscar("poliza"), []);

  await pagina.getByLabel("Buscar").fill("");
  await pagina.screenshot({ path: resolve(raiz, "e2e/captura.png") });
  assert.deepEqual(errores, [], "sin errores en la página");
  console.log("Prueba de punta a punta: todo bien.");
} finally {
  await navegador.close();
  await new Promise((ok) => servidor.httpServer.close(ok));
}
