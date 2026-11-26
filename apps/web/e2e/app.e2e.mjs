/**
 * Prueba de punta a punta de la app, en Chrome de verdad.
 * Crea una carpeta de prueba en el almacenamiento privado del navegador (OPFS),
 * se la da a la app, y revisa: indexa, lee Word y Excel, lee fotos y escaneos
 * con OCR, busca, muestra el texto, recuerda el índice al recargar, y se pone
 * al día cuando se agrega, se borra o se mueve un archivo. También el diseño
 * (carpetas, fila de documentos, ficha con QR y código de barras), el código único
 * de cada documento, la búsqueda por código y la exportación a Excel. Y desde la
 * entrega 4: fechas de vencimiento (detectar, confirmar, avisar) y duplicados.
 * Uso: npm run e2e  (desde la raíz del repositorio)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";
import { unzipSync, strFromU8 } from "fflate";

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
  await pagina.getByLabel("Guardar otra copia de todos modos").check();
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
