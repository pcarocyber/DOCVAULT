/**
 * Prueba de punta a punta de la app, en Chrome de verdad.
 * Crea una carpeta de prueba en el almacenamiento privado del navegador (OPFS),
 * se la da a la app, y revisa: indexa, lee Word y Excel, lee fotos y escaneos
 * con OCR, busca, muestra el texto, recuerda el índice al recargar, y se pone
 * al día cuando se agrega, se borra o se mueve un archivo. También el diseño
 * (carpetas, fila de documentos, ficha con QR y código de barras), el código único
 * de cada documento, la búsqueda por código y la exportación a Excel. Y desde la
 * entrega 4: fechas de vencimiento (detectar, confirmar, avisar) y duplicados.
 * Desde la entrega 5: imprimir con código, etiqueta, lector USB y cámara.
 * Uso: npm run e2e  (desde la raíz del repositorio)
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import jsQR from "jsqr";
import qrcode from "qrcode-generator";

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

/** Lee el QR de la primera página de un PDF: la dibuja con pdftoppm y la analiza con jsQR. */
function leerQrDePdf(ruta) {
  const dir = mkdtempSync(resolve(tmpdir(), "dv-qr-"));
  execFileSync("pdftoppm", ["-r", "150", "-f", "1", "-l", "1", ruta, resolve(dir, "p")]);
  const ppm = readFileSync(resolve(dir, readdirSync(dir).find((n) => n.endsWith(".ppm"))));
  const cab = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(ppm.subarray(0, 40).toString("latin1"));
  const [ancho, alto] = [Number(cab[1]), Number(cab[2])];
  const rgba = new Uint8ClampedArray(ancho * alto * 4);
  for (let i = 0, j = cab[0].length; i < ancho * alto; i++, j += 3) {
    rgba[i * 4] = ppm[j]; rgba[i * 4 + 1] = ppm[j + 1]; rgba[i * 4 + 2] = ppm[j + 2]; rgba[i * 4 + 3] = 255;
  }
  return jsQR(rgba, ancho, alto)?.data ?? null;
}

/** Los cuadritos de un QR, para la cámara de mentira. */
function modulosQr(texto) {
  const qr = qrcode(0, "M");
  qr.addData(texto); qr.make();
  const n = qr.getModuleCount();
  let celdas = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) celdas += qr.isDark(r, c) ? "1" : "0";
  return { n, celdas };
}

/** Archivos reales de e2e/datos (foto, escaneo, Word, Excel), en base64 para pasarlos al navegador. */
const datos = (n) => ({ base64: readFileSync(resolve(raiz, "e2e/datos", n)).toString("base64") });

const archivos = {
  "Contratos/arrendamiento local.pdf": pdfConTexto("Contrato de arrendamiento del local comercial, vence el 30 de junio de 2027. Arrendatario: Farmacia Nueva Aurora."),
  "Facturas/factura B0100004521.pdf": pdfConTexto("Factura de credito fiscal. Fecha limite de pago: 15 de diciembre de 2026. Total RD$ 30,208.00 por resmas de papel."),
  "notas.txt": "Póliza de seguro del vehículo: vigente hasta 03/04/2027. Renovar en mayo.",
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
// Un día fijo, para que "vence en 19 días" no cambie con la fecha real.
await pagina.clock.setFixedTime(new Date("2026-11-26T10:00:00"));
// Notificaciones de mentira: se anotan en vez de mostrarse.
await pagina.addInitScript(() => {
  window.__avisos = [];
  window.Notification = class {
    static permission = "default";
    static async requestPermission() { this.permission = "granted"; return "granted"; }
    constructor(titulo, op) { window.__avisos.push({ titulo, cuerpo: op?.body ?? "" }); }
    close() {}
  };
});
// Cámara de mentira: un video que muestra el QR puesto en window.__qrFalso,
// o una foto (window.__fotoFalsa, una imagen ya cargada).
await pagina.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const c = document.createElement("canvas");
    c.width = 640; c.height = 480;
    const ctx = c.getContext("2d");
    const pintar = () => {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 640, 480);
      const f = window.__fotoFalsa;
      if (f) { const k = Math.min(640 / f.width, 480 / f.height); ctx.drawImage(f, (640 - f.width * k) / 2, (480 - f.height * k) / 2, f.width * k, f.height * k); return; }
      const m = window.__qrFalso;
      if (!m) return;
      const t = Math.floor(360 / (m.n + 8)), x0 = (640 - m.n * t) / 2, y0 = (480 - m.n * t) / 2;
      ctx.fillStyle = "#000";
      for (let i = 0; i < m.celdas.length; i++) if (m.celdas[i] === "1") ctx.fillRect(x0 + (i % m.n) * t, y0 + Math.floor(i / m.n) * t, t, t);
    };
    pintar();
    setInterval(pintar, 100);
    return c.captureStream(10);
  };
});
// El modelo de IA básica se sirve desde bench/modelos (ver motores.ts); sin esa copia,
// la prueba lo bajaría de Hugging Face.
const errores = [];
pagina.on("pageerror", (e) => errores.push(e.message));
// DEPURAR=1 muestra la consola del navegador.
if (process.env.DEPURAR) pagina.on("console", (m) => console.log("  [consola]", m.text().slice(0, 300)));

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
  assert.match(await pagina.locator(".contexto").textContent(), /9 documentos/);

  // El OCR corre después, en segundo plano: foto, escaneo y una "foto" que no es imagen.
  const estadoOcr = pagina.locator(".estado").filter({ hasText: "Fotos y escaneos leídos" });
  await estadoOcr.waitFor({ timeout: 180_000 });
  assert.match(await estadoOcr.textContent(), /2 leídos.*1 no se pudieron leer/);
  console.log(`  OCR: ${(await estadoOcr.textContent()).trim()}`);

  // Vencimientos: la app lee la fecha de cada documento y avisa lo que vence pronto.
  const vencimientos = pagina.getByLabel("Vencimientos");
  await vencimientos.getByText("factura B0100004521.pdf").waitFor();
  assert.match(await vencimientos.textContent(), /vence en 19 días.*factura B0100004521\.pdf.*15 dic 2026/s, "la factura vence en 19 días");
  assert.doesNotMatch(await vencimientos.textContent(), /arrendamiento/, "lo que vence en más de 30 días no sale en la lista");
  assert.match(await vencimientos.textContent(), /1 fecha por confirmar/, "03/04/2027 se puede leer de dos formas");
  await vencimientos.getByRole("button", { name: "Ver todas las fechas (2 más adelante)" }).click();
  assert.match(await vencimientos.textContent(), /arrendamiento local\.pdf.*30 jun 2027/s);
  await vencimientos.getByRole("button", { name: "Activar avisos" }).click();
  await vencimientos.getByText("Avisos activos").waitFor();
  const avisos = await pagina.evaluate(() => window.__avisos);
  assert.equal(avisos.length, 1, "un solo aviso del navegador");
  assert.equal(avisos[0].titulo, "factura B0100004521.pdf vence en 19 días");
  assert.match(avisos[0].cuerpo, /^DV-\d{6} · 15 dic 2026$/);
  // Confirmar la fecha ambigua: el usuario elige cuál de las dos lecturas es.
  await vencimientos.getByRole("button", { name: "Confirmar la fecha de notas.txt" }).click();
  const fichaV = pagina.getByRole("dialog", { name: "Ficha del documento" });
  await fichaV.getByText("El documento dice «03/04/2027». ¿Qué fecha es?").waitFor();
  await pagina.screenshot({ path: resolve(raiz, "e2e/captura-vencimiento.png") });
  await fichaV.getByRole("button", { name: "4 de marzo de 2027" }).click();
  await fichaV.getByText("Confirmada por ti").waitFor();
  const codigoNotas = (await fichaV.locator(".codigo-grande").textContent()).trim();
  const decisiones = await pagina.evaluate(async () => {
    const raiz = await (await navigator.storage.getDirectory()).getDirectoryHandle("Mis documentos");
    const f = await (await (await raiz.getDirectoryHandle(".docvault")).getFileHandle("vencimientos.json")).getFile();
    return JSON.parse(await f.text());
  });
  assert.deepEqual(decisiones.codigos[codigoNotas], { vence: "2027-03-04", estado: "confirmada" }, "la decisión se guarda en la carpeta del usuario");
  // Corregir a mano la fecha de la factura.
  await pagina.keyboard.press("Escape");
  await vencimientos.getByRole("button", { name: "Ver ficha de factura B0100004521.pdf" }).click();
  await fichaV.getByRole("button", { name: "Cambiar" }).click();
  await fichaV.getByLabel("Fecha de vencimiento").fill("2026-12-01");
  await fichaV.getByRole("button", { name: "Guardar fecha" }).click();
  await fichaV.getByText("Escrita por ti").waitFor();
  assert.match(await fichaV.locator(".vence").textContent(), /vence en 5 días/);
  await pagina.keyboard.press("Escape");
  assert.doesNotMatch(await vencimientos.textContent(), /por confirmar/);

  const codigoDe = async (q) => {
    await buscar(q);
    return (await pagina.locator(".resultados .codigo").first().textContent()).trim();
  };
  const buscar = async (q) => {
    await pagina.getByLabel("Buscar").fill(q);
    await pagina.waitForTimeout(150);
    return pagina.locator(".resultados .nombre").allTextContents();
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

  // Ver la ficha de la foto: su código, el QR, el código de barras y el texto leído.
  await buscar("recibo");
  await pagina.getByRole("button", { name: "Ver ficha de recibo.jpg" }).click();
  const ficha = pagina.getByRole("dialog", { name: "Ficha del documento" });
  await ficha.waitFor();
  const codigoRecibo = (await ficha.locator(".codigo-grande").textContent()).trim();
  assert.match(codigoRecibo, /^DV-\d{6}$/, "cada documento tiene su código");
  assert.equal(await ficha.locator("svg.qr").count(), 1, "la ficha muestra el QR");
  assert.equal(await ficha.locator("svg.barras").count(), 1, "la ficha muestra el código de barras");
  assert.equal(new URL(pagina.url()).hash, `#${codigoRecibo}`, "la dirección lleva el código");
  await ficha.getByRole("button", { name: "Ver texto" }).click();
  const texto = await ficha.locator(".texto pre").textContent();
  assert.match(texto, /RECIBO DE PAGO/);
  assert.match(await ficha.locator(".texto .nota").textContent(), /Leído con OCR · confianza \d+ %/);
  await pagina.screenshot({ path: resolve(raiz, "e2e/captura-ficha.png") });
  await pagina.keyboard.press("Escape");
  await ficha.waitFor({ state: "detached" });

  // Los 9 documentos tienen códigos distintos, del DV-000001 al DV-000009.
  const codigos = [];
  for (let n = 1; n <= 9; n++) {
    const r = await buscar(`DV-${String(n).padStart(6, "0")}`);
    assert.ok(r.length >= 1, `el código DV-${n} existe`);
    codigos.push(r[0]);
  }
  assert.equal(new Set(codigos).size, 9, "no hay dos documentos con el mismo código");
  // También se reconoce escrito a mano ("dv 3", "000003") y Enter abre la ficha, como haría un lector.
  const tercero = codigos[2];
  assert.equal((await buscar("dv 3"))[0], tercero);
  assert.equal((await buscar("000003"))[0], tercero);
  await pagina.getByLabel("Buscar").press("Enter");
  await ficha.waitFor();
  assert.equal((await ficha.locator(".ficha-nombre").textContent()).trim(), tercero);
  await pagina.getByRole("button", { name: "Cerrar la ficha" }).click();

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
  assert.equal(await codigoDe("poder"), "DV-000010", "el nuevo recibe el siguiente número; el del borrado no se reutiliza");

  // Mover un archivo a otra carpeta fuera de la app: conserva su código.
  const codigoActo = await codigoDe("toyota chasis");
  await pagina.evaluate(async () => {
    const raiz = await (await navigator.storage.getDirectory()).getDirectoryHandle("Mis documentos");
    const origen = await raiz.getDirectoryHandle("Vehículo");
    const f = await (await origen.getFileHandle("acto de venta.docx")).getFile();
    const w = await (await (await raiz.getDirectoryHandle("Contratos")).getFileHandle("acto de venta.docx", { create: true })).createWritable();
    await w.write(await f.arrayBuffer()); await w.close();
    await origen.removeEntry("acto de venta.docx");
  });
  await pagina.getByLabel("Buscar").fill("");
  await pagina.getByRole("button", { name: "Actualizar" }).click();
  await pagina.getByText(/0 nuevos, 0 cambiados, 0 quitados, 8 sin cambios\. 1 movido o renombrado/).waitFor({ timeout: 30_000 });
  assert.equal(await codigoDe("toyota chasis"), codigoActo, "el archivo movido conserva su código");
  assert.match(await pagina.locator(".resultados .meta").first().textContent(), /^Contratos/);

  // Carpetas: describir dos que ya existen y crear una nueva.
  await pagina.getByLabel("Buscar").fill("");
  const describir = async (nombre, descripcion) => {
    await pagina.getByRole("button", { name: `Editar ${nombre}` }).click();
    await pagina.getByLabel("¿Qué va en esta carpeta?").fill(descripcion);
    await pagina.getByRole("button", { name: "Guardar", exact: true }).click();
    await pagina.locator(".tarjeta-carpeta").filter({ hasText: descripcion }).waitFor();
  };
  await describir("Facturas", "facturas, recibos y comprobantes de compra o pago");
  await describir("Contratos", "contratos y acuerdos firmados entre partes: alquiler, servicios, confidencialidad");
  await pagina.getByRole("button", { name: "Nueva carpeta" }).click();
  await pagina.getByRole("button", { name: "Crear carpeta" }).click();
  assert.match(await pagina.locator(".panel .error").textContent(), /Escribe un nombre/, "no deja crear sin nombre");
  await pagina.getByLabel("Nombre").fill("Seguros");
  await pagina.getByLabel("¿Qué va en esta carpeta?").fill("pólizas, certificados de seguro y garantías");
  await pagina.getByRole("button", { name: "Crear carpeta" }).click();
  await pagina.locator(".tarjeta-carpeta").filter({ hasText: "Seguros" }).waitFor();
  const ajustes = await pagina.evaluate(async () => {
    const raiz = await (await navigator.storage.getDirectory()).getDirectoryHandle("Mis documentos");
    const f = await (await (await raiz.getDirectoryHandle(".docvault")).getFileHandle("carpetas.json")).getFile();
    return JSON.parse(await f.text());
  });
  assert.equal(ajustes.carpetas.Seguros, "pólizas, certificados de seguro y garantías", "la descripción se guarda en la carpeta del usuario");

  // Subir tres archivos: la app los lee (uno con OCR), sugiere carpeta y guarda al confirmar.
  await pagina.getByLabel("Elegir archivos para subir").setInputFiles([
    { name: "factura luz.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdfConTexto("Factura de luz. Total RD$ 3,450.00. Fecha de vencimiento: 20 de diciembre de 2026.")) },
    { name: "IMG_2031.jpg", mimeType: "image/jpeg", buffer: readFileSync(resolve(raiz, "e2e/datos/recibo.jpg")) },
    { name: "poliza auto.txt", mimeType: "text/plain", buffer: Buffer.from("Poliza de seguro de vehiculo. Cobertura contra todo riesgo. Aseguradora: Seguros Ejemplo. Vigencia hasta marzo 2027.") },
  ]);
  const guardar = pagina.locator(".subir").getByRole("button", { name: "Guardar" });
  await guardar.waitFor({ timeout: 120_000 });
  await pagina.waitForFunction(() => !document.querySelector(".subir .primario")?.hasAttribute("disabled"), null, { timeout: 120_000 });
  // La foto es el mismo archivo que fotos/recibo.jpg: la app avisa y no la guarda, salvo que se pida.
  const avisoDup = pagina.locator(".subir .aviso-dup");
  assert.equal(await avisoDup.count(), 1, "solo la foto repetida tiene aviso");
  assert.match(await avisoDup.textContent(), /Copia exacta de recibo\.jpg \(DV-\d{6}\), que ya está en tu bóveda/);
  assert.match(await pagina.locator(".subir").textContent(), /factura luz\.pdf.*Vence: 20 dic 2026 \(vence en 24 días\)/s, "al subir se ve la fecha de vencimiento");
  // Comparar lado a lado y decidir agregarla como sea.
  await avisoDup.getByRole("button", { name: "Comparar lado a lado" }).click();
  const comparar = pagina.getByRole("dialog", { name: "Comparar documentos" });
  await comparar.getByText("¿Quieres agregarlo como sea o dejarlo así?").waitFor();
  assert.match(await comparar.getByLabel(/^El que estás subiendo/).textContent(), /IMG_2031\.jpg/);
  assert.match(await comparar.getByLabel(/^El que ya está en tu bóveda/).textContent(), /recibo\.jpg.*DV-\d{6}.*RECIBO/s);
  await comparar.locator(".previa img").first().waitFor();
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: resolve(raiz, "e2e/captura-comparar-subida.png") });
  await comparar.getByRole("button", { name: "Agregarlo como sea" }).click();
  await comparar.waitFor({ state: "detached" });
  assert.match(await avisoDup.textContent(), /Decidiste agregarlo como sea/);
  assert.equal(await pagina.getByLabel("Guardar otra copia de todos modos").isChecked(), true);
  const elegida = (n) => pagina.getByLabel(`Carpeta para ${n}`).inputValue();
  // Sin el modelo en bench/modelos y sin acceso a Hugging Face, la IA básica no carga:
  // la app lo dice y el usuario elige a mano. Así la prueba sigue con lo demás.
  const sinIa = (await pagina.locator(".subir .error").allTextContents()).some((t) => /IA básica/.test(t));
  if (sinIa) {
    console.log("  Aviso: la IA básica no cargó (sin modelo local ni internet); las carpetas se eligen a mano.");
    await pagina.getByLabel("Carpeta para factura luz.pdf").selectOption("Facturas");
    await pagina.getByLabel("Carpeta para IMG_2031.jpg").selectOption("Facturas");
    await pagina.getByLabel("Carpeta para poliza auto.txt").selectOption("Seguros");
  } else {
    const sugerencias = { factura: await elegida("factura luz.pdf"), foto: await elegida("IMG_2031.jpg"), poliza: await elegida("poliza auto.txt") };
    console.log(`  Sugerencias: ${JSON.stringify(sugerencias)}`);
    assert.equal(sugerencias.factura, "Facturas");
    // Un recibo de alquiler es ambiguo (Facturas o Contratos): aquí el usuario corrige la sugerencia.
    assert.ok(["Facturas", "Contratos"].includes(sugerencias.foto), "el recibo leído con OCR va a una carpeta descrita");
    await pagina.getByLabel("Carpeta para IMG_2031.jpg").selectOption("Facturas");
    assert.equal(sugerencias.poliza, "Seguros");
    assert.match(await pagina.locator(".subir").textContent(), /\(sugerida\)/);
  }
  await pagina.screenshot({ path: resolve(raiz, "e2e/captura-subir.png") });
  await guardar.click();
  await pagina.getByText("3 archivos guardados en tu carpeta.").waitFor({ timeout: 30_000 });
  await pagina.getByRole("button", { name: "Cerrar" }).click();
  assert.deepEqual(await buscar("vigencia"), ["poliza auto.txt"]);
  assert.match(await pagina.locator(".resultados .meta").first().textContent(), /^Seguros/);
  assert.match(await codigoDe("vigencia"), /^DV-0000(1[1-3])$/, "lo subido recibe su código");
  assert.equal((await buscar("alquiler octubre")).length, 2, "la foto subida se puede buscar por su texto");
  const escritos = await pagina.evaluate(async () => {
    const raiz = await (await navigator.storage.getDirectory()).getDirectoryHandle("Mis documentos");
    const nombres = async (d) => { const n = []; for await (const h of (await raiz.getDirectoryHandle(d)).values()) n.push(h.name); return n.sort(); };
    return { Facturas: await nombres("Facturas"), Seguros: await nombres("Seguros") };
  });
  assert.deepEqual(escritos, { Facturas: ["IMG_2031.jpg", "factura B0100004521.pdf", "factura luz.pdf"], Seguros: ["poliza auto.txt"] });

  // En la portada aparece el par de copias, y se puede descartar.
  await pagina.getByLabel("Buscar").fill("");
  const dup = pagina.getByLabel("Duplicados");
  await dup.getByText("Copia exacta").waitFor();
  assert.match(await dup.textContent(), /IMG_2031\.jpg y recibo\.jpg|recibo\.jpg y IMG_2031\.jpg/);
  assert.equal(await dup.locator("li").count(), 1, "sin falsos positivos");
  await pagina.screenshot({ path: resolve(raiz, "e2e/captura-alertas.png") });
  // Comparar en la portada y quitar la copia: va a la papelera, no se borra.
  await dup.getByRole("button", { name: /^Comparar / }).click();
  const comparar2 = pagina.getByRole("dialog", { name: "Comparar documentos" });
  await comparar2.getByRole("heading", { name: "¿Son duplicados?" }).waitFor();
  await comparar2.locator(".previa img").nth(1).waitFor();
  await pagina.waitForTimeout(400);
  await pagina.screenshot({ path: resolve(raiz, "e2e/captura-comparar.png") });
  await comparar2.getByLabel(/IMG_2031\.jpg$/).getByRole("button", { name: "Sí, quitar este" }).click();
  await comparar2.waitFor({ state: "detached" });
  await pagina.getByText("«IMG_2031.jpg» está en la papelera").waitFor();
  await dup.getByText("No encontré copias").waitFor();
  const enDisco = await pagina.evaluate(async () => {
    const raiz = await (await navigator.storage.getDirectory()).getDirectoryHandle("Mis documentos");
    const nombres = async (d) => { const n = []; for await (const h of d.values()) n.push(h.name); return n.sort(); };
    const pap = await (await raiz.getDirectoryHandle(".docvault")).getDirectoryHandle("papelera");
    return { facturas: await nombres(await raiz.getDirectoryHandle("Facturas")), papelera: await nombres(pap) };
  });
  assert.ok(!enDisco.facturas.includes("IMG_2031.jpg"), "ya no está en Facturas");
  assert.equal(enDisco.papelera.length, 1);
  assert.match(enDisco.papelera[0], /IMG_2031\.jpg$/);
  // Recuperarlo desde la papelera: vuelve a su lugar con su código.
  await dup.getByRole("button", { name: "Papelera (1)" }).click();
  const pap = pagina.getByRole("dialog", { name: "Papelera" });
  assert.match(await pap.textContent(), /IMG_2031\.jpg.*estaba en Facturas\/IMG_2031\.jpg/s);
  await pap.getByRole("button", { name: "Recuperar" }).click();
  await pagina.getByText("Recuperé «IMG_2031.jpg» en Facturas.").waitFor();
  await pap.getByText("La papelera está vacía.").waitFor();
  await pap.getByRole("button", { name: "Cerrar" }).click();
  // El par vuelve; esta vez el usuario dice que no son duplicados.
  await dup.getByText("Copia exacta").waitFor();
  await dup.getByRole("button", { name: "No son duplicados" }).click();
  await dup.getByText("No encontré copias").waitFor();

  // Subir otra vez un archivo con el mismo nombre no reemplaza el anterior.
  await pagina.getByLabel("Elegir archivos para subir").setInputFiles([
    { name: "poliza auto.txt", mimeType: "text/plain", buffer: Buffer.from("Endoso de la poliza de seguro: cambio de placa.") },
  ]);
  await pagina.waitForFunction(() => !document.querySelector(".subir .primario")?.hasAttribute("disabled"), null, { timeout: 60_000 });
  if (sinIa) await pagina.getByLabel("Carpeta para poliza auto.txt").selectOption("Seguros");
  await pagina.locator(".subir").getByRole("button", { name: "Guardar" }).click();
  await pagina.getByText("Guardado en Seguros/poliza auto (2).txt (ya había uno con ese nombre)").waitFor({ timeout: 30_000 });
  await pagina.getByRole("button", { name: "Cerrar" }).click();

  // Abrir una carpeta: sus documentos aparecen en fila, y la búsqueda se puede limitar a ella.
  await pagina.getByLabel("Buscar").fill("");
  await pagina.getByRole("button", { name: "Carpeta Facturas" }).click();
  const fila = pagina.getByRole("list", { name: "Documentos de Facturas" });
  assert.deepEqual((await fila.locator(".nombre").allTextContents()).sort(), ["IMG_2031.jpg", "factura B0100004521.pdf", "factura luz.pdf"]);
  await pagina.screenshot({ path: resolve(raiz, "e2e/captura-carpeta.png") });
  assert.deepEqual((await buscar("pago")).every((n) => /factura|IMG_2031/.test(n)), true, "con la carpeta abierta, busca solo en ella");
  const enFacturas = (await buscar("pago")).length;
  await pagina.getByLabel("Solo en Facturas").uncheck();
  assert.ok((await buscar("pago")).length > enFacturas, "sin el filtro busca en todas las carpetas");
  await pagina.getByLabel("Buscar").fill("");
  await pagina.getByRole("button", { name: "Carpeta Facturas" }).click();

  // La fila de recientes sigue al cursor: al llevarlo a la derecha, se desplaza.
  const recientes = pagina.getByRole("list", { name: "Documentos recientes" });
  await recientes.scrollIntoViewIfNeeded();
  const caja = await recientes.boundingBox();
  await pagina.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await pagina.mouse.move(caja.x + caja.width - 4, caja.y + caja.height / 2, { steps: 8 });
  await pagina.waitForTimeout(1200);
  const desplazado = await recientes.evaluate((el) => ({ izq: el.scrollLeft, max: el.scrollWidth - el.clientWidth }));
  assert.ok(desplazado.max > 0 && desplazado.izq > desplazado.max * 0.9, `la fila sigue al cursor (${JSON.stringify(desplazado)})`);
  await pagina.mouse.move(0, 0);

  // Exportar el índice a Excel, con los códigos.
  const [descarga] = await Promise.all([pagina.waitForEvent("download"), pagina.getByRole("button", { name: "Exportar a Excel" }).click()]);
  assert.match(descarga.suggestedFilename(), /^DOCVAULT indice \d{4}-\d{2}-\d{2}\.xlsx$/);
  const xlsx = unzipSync(new Uint8Array(readFileSync(await descarga.path())));
  const hoja = strFromU8(xlsx["xl/worksheets/sheet1.xml"]);
  assert.equal((hoja.match(/<row /g) ?? []).length, 14, "encabezado y 13 documentos");
  assert.match(hoja, /Código.*Nombre.*Carpeta/s);
  assert.match(hoja, />DV-000001</);
  assert.match(hoja, /Vence.*Origen de la fecha/s);
  assert.match(hoja, />arrendamiento local\.pdf<.*?>30 jun 2027<.*?>Leída en el documento</s);
  assert.match(hoja, />factura B0100004521\.pdf<.*?>1 dic 2026<.*?>Escrita a mano</s);
  assert.match(hoja, new RegExp(`>${codigoActo}<.*?>acto de venta\\.docx<.*?>Contratos<`, "s"));

  // Los códigos también quedan en la carpeta del usuario (.docvault/codigos.json).
  const guardados = await pagina.evaluate(async () => {
    const raiz = await (await navigator.storage.getDirectory()).getDirectoryHandle("Mis documentos");
    const f = await (await (await raiz.getDirectoryHandle(".docvault")).getFileHandle("codigos.json")).getFile();
    return JSON.parse(await f.text());
  });
  assert.equal(Object.keys(guardados.codigos).length, 13);
  assert.equal(guardados.codigos["Contratos/acto de venta.docx"], codigoActo);
  assert.equal(guardados.siguiente, 15);

  // Entrega 5: descargar el documento con su código estampado al pie.
  const codigoArr = guardados.codigos["Contratos/arrendamiento local.pdf"];
  await pagina.getByLabel("Buscar").fill(codigoArr);
  await pagina.getByLabel("Buscar").press("Enter");
  await ficha.waitFor();
  assert.equal((await ficha.locator(".codigo-grande").textContent()).trim(), codigoArr, "Enter en el buscador con un código abre su ficha");
  const imprimir = ficha.getByRole("region", { name: "Código en papel" });
  await imprimir.scrollIntoViewIfNeeded();
  await pagina.screenshot({ path: resolve(raiz, "e2e/captura-imprimir.png") });
  const [conCodigo] = await Promise.all([pagina.waitForEvent("download"), imprimir.getByRole("button", { name: "Descargar con código" }).click()]);
  assert.equal(conCodigo.suggestedFilename(), `arrendamiento local ${codigoArr}.pdf`);
  const pdfEstampado = await PDFDocument.load(readFileSync(await conCodigo.path()));
  assert.equal(pdfEstampado.getPageCount(), 1);
  assert.deepEqual(pdfEstampado.getPage(0).getMediaBox(), { x: 0, y: -114, width: 612, height: 906 }, "la página se alarga para la franja");
  const rutaArr = await conCodigo.path();
  assert.equal(leerQrDePdf(rutaArr), codigoArr, "el QR impreso se puede leer");
  assert.equal(await imprimir.getByRole("button", { name: "Imprimir con código" }).count(), 0, "ya no hay «Imprimir con código»");
  await imprimir.getByText("Listo: el PDF con el código está en Descargas").waitFor();
  // La etiqueta se abre en una pestaña nueva. Aquí se anota la pestaña (Chrome sin pantalla
  // no muestra PDF) para revisar lo que iba a mostrar.
  await pagina.evaluate(() => {
    window.__pdfs = [];
    window.open = () => ({ document: { body: {} }, location: { set href(u) { window.__pdfs.push(u); } }, close() {} });
  });
  const ultimoPdf = async (n) => {
    await pagina.waitForFunction((n) => window.__pdfs.length >= n, n, { timeout: 10_000 });
    const bytes = await pagina.evaluate(async (i) => [...new Uint8Array(await (await fetch(window.__pdfs[i])).arrayBuffer())], n - 1);
    const ruta = resolve(mkdtempSync(resolve(tmpdir(), "dv-pdf-")), "impreso.pdf");
    writeFileSync(ruta, Uint8Array.from(bytes));
    return { ruta, pdf: await PDFDocument.load(readFileSync(ruta)) };
  };
  await imprimir.getByRole("button", { name: "Imprimir etiqueta" }).click();
  const et = await ultimoPdf(1);
  assert.deepEqual([et.pdf.getPage(0).getWidth(), et.pdf.getPage(0).getHeight()], [198, 85], "etiqueta de 7 × 3 cm");
  assert.equal(leerQrDePdf(et.ruta), codigoArr, "el QR de la etiqueta se puede leer");
  await imprimir.getByText("La etiqueta (7 × 3 cm) se abrió en una pestaña nueva").waitFor();
  await pagina.getByRole("button", { name: "Cerrar la ficha" }).click();

  // Una foto también se descarga con código: queda en una hoja carta con la franja.
  await pagina.getByLabel("Buscar").fill(codigoRecibo);
  await pagina.getByLabel("Buscar").press("Enter");
  await ficha.waitFor();
  const [fotoConCodigo] = await Promise.all([pagina.waitForEvent("download"), imprimir.getByRole("button", { name: "Descargar con código" }).click()]);
  await fotoConCodigo.saveAs(resolve(raiz, "e2e/captura-estampado.pdf"));
  const pdfFoto = await PDFDocument.load(readFileSync(await fotoConCodigo.path()));
  assert.equal(pdfFoto.getPage(0).getHeight(), 906);
  assert.equal((await ficha.locator(".codigo-grande").textContent()).trim(), codigoRecibo);
  assert.equal(leerQrDePdf(await fotoConCodigo.path()), codigoRecibo);
  // Un Word no se puede estampar: solo se ofrece la etiqueta.
  await pagina.getByRole("button", { name: "Cerrar la ficha" }).click();
  await pagina.getByLabel("Buscar").fill(codigoActo);
  await pagina.getByLabel("Buscar").press("Enter");
  await ficha.waitFor();
  assert.equal(await imprimir.getByRole("button", { name: "Descargar con código" }).count(), 0);
  assert.equal(await imprimir.getByRole("button", { name: "Imprimir etiqueta" }).count(), 1);
  await pagina.getByRole("button", { name: "Cerrar la ficha" }).click();

  // Un lector USB escribe el código muy rápido y pulsa Enter, fuera del buscador:
  // se abre la ficha y su carpeta.
  await pagina.getByLabel("Buscar").fill("");
  await pagina.evaluate(() => document.activeElement?.blur());
  await pagina.keyboard.type(`${codigoArr}\n`);
  await ficha.waitFor();
  assert.equal((await ficha.locator(".codigo-grande").textContent()).trim(), codigoArr, "el lector USB abre la ficha");
  await pagina.getByRole("list", { name: "Documentos de Contratos" }).waitFor();
  await pagina.getByRole("button", { name: "Cerrar la ficha" }).click();
  await pagina.getByRole("button", { name: "Carpeta Contratos" }).click();

  // Escanear con la cámara: primero un código que no es de la bóveda, luego uno que sí.
  await pagina.evaluate((m) => { window.__qrFalso = m; }, modulosQr("DV-999999"));
  await pagina.getByRole("button", { name: "Escanear" }).click();
  const escaner = pagina.getByRole("dialog", { name: "Escanear código" });
  await escaner.getByText("DV-999999 no está en esta bóveda.").waitFor({ timeout: 15_000 });
  await pagina.waitForTimeout(300); // que termine de aparecer
  await pagina.screenshot({ path: resolve(raiz, "e2e/captura-escanear.png") });
  await pagina.evaluate((m) => { window.__qrFalso = m; }, modulosQr(codigoRecibo));
  await ficha.waitFor({ timeout: 15_000 });
  assert.equal(await escaner.count(), 0, "el escáner se cierra al leer el código");
  assert.equal((await ficha.locator(".codigo-grande").textContent()).trim(), codigoRecibo, "la cámara abre la ficha");
  await pagina.getByRole("button", { name: "Cerrar la ficha" }).click();

  // Solo el código de barras (el QR tapado), tomado de la franja impresa del PDF: también abre la ficha.
  const dirFoto = mkdtempSync(resolve(tmpdir(), "dv-foto-"));
  execFileSync("pdftoppm", ["-r", "100", "-png", "-f", "1", "-l", "1", "-x", "0", "-y", "1080", "-W", "850", "-H", "178", rutaArr, resolve(dirFoto, "f")]);
  const foto = resolve(dirFoto, readdirSync(dirFoto).find((n) => n.endsWith(".png")));
  execFileSync("convert", [foto, "-fill", "white", "-draw", "rectangle 0,0 160,178", foto]);
  await pagina.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    window.__qrFalso = null; window.__fotoFalsa = img;
  }, readFileSync(foto).toString("base64"));
  await pagina.getByRole("button", { name: "Escanear" }).click();
  await ficha.waitFor({ timeout: 15_000 });
  assert.equal((await ficha.locator(".codigo-grande").textContent()).trim(), codigoArr, "la cámara lee el código de barras impreso");
  await pagina.getByRole("button", { name: "Cerrar la ficha" }).click();

  // Un lector USB con el teclado en español escribe ' en vez de -: igual abre la ficha.
  await pagina.evaluate(() => document.activeElement?.blur());
  await pagina.keyboard.type(`${codigoRecibo.replace("-", "'")}\n`);
  await ficha.waitFor();
  assert.equal((await ficha.locator(".codigo-grande").textContent()).trim(), codigoRecibo, "lector USB con teclado en español");
  await pagina.getByRole("button", { name: "Cerrar la ficha" }).click();
  console.log("  Descargar con código, etiqueta, lector USB y cámara: bien.");

  // Al recargar no hay nada nuevo que leer: lo subido ya quedó en el índice.
  // Un enlace con el código (#DV-000002) abre directamente la ficha de ese documento.
  await pagina.evaluate(() => history.replaceState(null, "", "?pruebas#DV-000002"));
  await pagina.reload();
  await estadoIndice.waitFor({ timeout: 30_000 });
  assert.match(await estadoIndice.textContent(), /0 nuevos, 0 cambiados, 0 quitados, 13 sin cambios/);
  await ficha.waitFor();
  assert.equal((await ficha.locator(".codigo-grande").textContent()).trim(), "DV-000002");
  await pagina.keyboard.press("Escape");

  await pagina.getByLabel("Buscar").fill("");
  await pagina.screenshot({ path: resolve(raiz, "e2e/captura.png") });
  assert.deepEqual(errores, [], "sin errores en la página");
  console.log("Prueba de punta a punta: todo bien.");
} finally {
  await navegador.close();
  await new Promise((ok) => servidor.httpServer.close(ok));
}
