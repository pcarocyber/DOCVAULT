/** Arma el informe (Markdown y HTML) a partir de los resultados de una corrida. */
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Resultados } from "./puntuar";
import type { Umbrales } from "./tipos";
import { leerJson } from "./rutas";

type Bloque =
  | { h: 1 | 2 | 3; texto: string }
  | { p: string }
  | { lista: string[] }
  | { tabla: { cab: string[]; filas: string[][] } };

const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "—");
const seg = (x: number) => (Number.isFinite(x) ? (x < 0.01 ? `${(x * 1000).toFixed(2)} ms` : x < 1 ? `${Math.round(x * 1000)} ms` : `${x.toFixed(1)} s`) : "—");
const estado = (p: boolean | null) => (p === null ? "PENDIENTE" : p ? "PASA" : "NO PASA");

export type Calificaciones = Record<string, number>;

export function resumenPorModelo(res: Resultados, cal: Calificaciones) {
  return res.ollama.modelos.filter((m) => m.instalado).map((m) => {
    const rs = res.ollama.resumenes.filter((r) => r.modelo === m.modelo && !r.error);
    const notas = rs.map((r) => cal[r.id]).filter((n): n is number => typeof n === "number");
    const tiempos = rs.map((r) => r.segundos);
    return {
      modelo: m.modelo, memoriaGB: m.memoriaGB, segundosCarga: m.segundosCarga,
      resumenes: rs.length, errores: res.ollama.resumenes.filter((r) => r.modelo === m.modelo && r.error).length,
      promedio: tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : NaN,
      maximo: tiempos.length ? Math.max(...tiempos) : NaN,
      tokensPorSegundo: rs.length ? rs.reduce((a, r) => a + r.tokensPorSegundo, 0) / rs.length : NaN,
      calificados: notas.length,
      calidad: notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : NaN,
    };
  });
}

export function construirBloques(res: Resultados, u: Umbrales, cal: Calificaciones): { bloques: Bloque[]; resumen: { que: string; pasa: boolean | null }[] } {
  const b: Bloque[] = [];
  const e = res.equipo;
  b.push({ h: 1, texto: "DOCVAULT · Informe de la fase 0" });
  b.push({ lista: [
    `Fecha: ${new Date(e.fecha).toLocaleString("es-DO")}`,
    `Equipo: ${e.procesador}, ${e.nucleos} núcleos, ${e.memoriaGB} GB de RAM, ${e.sistema}`,
    `Navegador: ${e.navegador}`,
  ] });
  b.push({ p: "Cómo leerlo: la primera tabla es la del plan técnico, ya llena. PASA quiere decir que se cumple el umbral y se toma la decisión de la columna \"Decisión\". PENDIENTE quiere decir que falta un paso (por ejemplo, calificar los resúmenes). Debajo está el detalle por documento." });

  const filas: { que: string; medido: string; umbral: string; pasa: boolean | null; decision: string }[] = [];

  // OCR
  const o = res.ocr;
  const ocrPasa = o.promedioSegundosPagina < u.ocr.segundos_por_pagina_max && o.aciertoLimpios >= u.ocr.palabras_correctas_min;
  filas.push({
    que: "OCR",
    medido: `${seg(o.promedioSegundosPagina)} por página en promedio (máximo ${seg(o.maxSegundosPagina)}). Palabras correctas: ${pct(o.aciertoLimpios)} en escaneos limpios, ${pct(o.aciertoTodos)} en todas las fotos y escaneos.`,
    umbral: `Menos de ${u.ocr.segundos_por_pagina_max} s por página y ${pct(u.ocr.palabras_correctas_min)} en escaneos limpios`,
    pasa: ocrPasa,
    decision: ocrPasa ? "Usar Tesseract.js" : "Probar PaddleOCR antes de la fase 1",
  });

  // Carpeta
  const c = res.carpeta as { ok: boolean; error?: string; modos?: Record<string, { top1: number; top3: number }> };
  if (c.ok && c.modos) {
    const m = c.modos[u.carpeta.modo_para_decidir];
    const pasa = m.top1 >= u.carpeta.acierto_min;
    filas.push({
      que: "Sugerencia de carpeta",
      medido: `Primera sugerencia correcta: ${pct(c.modos.solo_nombre.top1)} solo con el nombre de la carpeta y ${pct(c.modos.nombre_y_descripcion.top1)} con nombre y una descripción corta. La correcta está entre las 3 primeras: ${pct(m.top3)}.`,
      umbral: `${pct(u.carpeta.acierto_min)} o más (modo: ${u.carpeta.modo_para_decidir.replace(/_/g, " ")})`,
      pasa,
      decision: pasa ? "La sugerencia aparece preseleccionada y el usuario confirma al subir" : "Se muestran las 3 carpetas más probables, sin preseleccionar",
    });
  } else {
    filas.push({ que: "Sugerencia de carpeta", medido: `No se pudo medir: ${c.error}`, umbral: `${pct(u.carpeta.acierto_min)} o más`, pasa: null, decision: "Revisar el error y volver a correr" });
  }

  // Resumen con Ollama
  const modelos = resumenPorModelo(res, cal);
  const chico = modelos.find((m) => m.modelo === u.resumen.modelo_pequeno);
  let pasaRes: boolean | null = null;
  let decisionRes = "";
  if (!res.ollama.disponible) decisionRes = "No medido: Ollama no estaba abierto. Ábrelo y vuelve a correr npm run banco";
  else if (!chico) decisionRes = `No medido: falta el modelo ${u.resumen.modelo_pequeno}. Ejecuta npm run preparar`;
  else if (chico.calificados < chico.resumenes) decisionRes = `Falta calificar ${chico.resumenes - chico.calificados} resúmenes del modelo pequeño: ejecuta npm run calificar`;
  else {
    pasaRes = chico.promedio < u.resumen.segundos_max && chico.calidad >= u.resumen.calidad_min;
    decisionRes = pasaRes ? `${u.resumen.modelo_pequeno} es el predeterminado` : "En equipos modestos se ofrece Claude (con aviso) y el resumen local es de frases clave";
  }
  filas.push({
    que: "Resumen y recomendaciones con Ollama",
    medido: modelos.length
      ? modelos.map((m) => `${m.modelo}: ${seg(m.promedio)} por documento, ${m.memoriaGB ? m.memoriaGB.toFixed(1) + " GB de memoria" : "memoria no disponible"}, calidad ${Number.isFinite(m.calidad) ? m.calidad.toFixed(1) : "sin calificar"}${m.calificados && m.calificados < m.resumenes ? ` (${m.calificados} de ${m.resumenes} calificados)` : ""}`).join(". ")
      : "Sin datos",
    umbral: `Menos de ${u.resumen.segundos_max} s y calidad de ${u.resumen.calidad_min} o más con ${u.resumen.modelo_pequeno}`,
    pasa: pasaRes,
    decision: decisionRes,
  });

  // Fechas
  const f = res.fechas;
  const pasaF = f.acierto >= u.fechas.acierto_min && f.ambiguasPreguntadas === f.ambiguasTotal;
  filas.push({
    que: "Fechas de vencimiento",
    medido: `${pct(f.acierto)} bien leídas (${f.documentos.filter((d) => d.bien).length} de ${f.documentos.length}). Ambiguas preguntadas: ${f.ambiguasPreguntadas} de ${f.ambiguasTotal}. Con el texto exacto, sin errores de OCR: ${pct(f.aciertoConTextoExacto)}.`,
    umbral: `${pct(u.fechas.acierto_min)} o más y las ambiguas siempre preguntadas`,
    pasa: pasaF,
    decision: pasaF ? "Se detecta la fecha y solo se pide confirmar las ambiguas" : "Se pide confirmar todas las fechas",
  });

  // Duplicados
  const d = res.duplicados;
  const hallados = d.esperados.filter((x) => x.encontrado).length;
  const pasaD = hallados === d.esperados.length && d.falsosPositivos.length <= u.duplicados.falsos_positivos_max;
  filas.push({
    que: "Duplicados",
    medido: `Encontró ${hallados} de ${d.esperados.length} pares, con ${d.falsosPositivos.length} falsos positivos. Similitud más alta entre documentos distintos: ${d.mayorSimilitudNoPar ? d.mayorSimilitudNoPar.similitud.toFixed(2) : "—"} (umbral ${d.umbral}).`,
    umbral: "Los 4 pares y ningún falso positivo",
    pasa: pasaD,
    decision: pasaD ? `Mantener el umbral de similitud en ${d.umbral}` : "Ajustar el umbral de similitud",
  });

  // Búsqueda
  const s = res.busqueda as { ok: boolean; error?: string; documentos?: number; segundosAgregar?: number; segundosMediana?: number; segundosMax?: number; recuperacion?: number; consultas?: number };
  if (s.ok) {
    const pasaS = s.segundosMax! < u.busqueda.segundos_max;
    filas.push({
      que: "Índice y búsqueda",
      medido: `Indexar ${s.documentos!.toLocaleString("es-DO")} documentos: ${seg(s.segundosAgregar!)}. Búsqueda: ${seg(s.segundosMediana!)} típica, ${seg(s.segundosMax!)} la más lenta (${s.consultas} búsquedas). Encontró ${pct(s.recuperacion!)} de los documentos esperados.`,
      umbral: `Menos de ${u.busqueda.segundos_max} s por búsqueda`,
      pasa: pasaS,
      decision: pasaS ? "Mantener SQLite con FTS5" : "Revisar el diseño del índice",
    });
  } else {
    filas.push({ que: "Índice y búsqueda", medido: `No se pudo medir: ${s.error}`, umbral: `Menos de ${u.busqueda.segundos_max} s`, pasa: null, decision: "Revisar el error y volver a correr" });
  }

  b.push({ h: 2, texto: "Tabla de la fase 0" });
  b.push({ tabla: { cab: ["Qué", "Medido", "Umbral", "Resultado", "Decisión"], filas: filas.map((x) => [x.que, x.medido, x.umbral, estado(x.pasa), x.decision]) } });

  b.push({ h: 2, texto: "Las tres decisiones" });
  b.push({ lista: [
    `Qué OCR usar: ${filas[0].decision}.`,
    `Qué nivel de IA es el predeterminado: ${filas[2].pasa === null ? "pendiente (" + filas[2].decision + ")" : filas[2].decision}.`,
    `Qué tan buena es la carpeta que sugiere la app: ${filas[1].decision}.`,
  ] });

  // ---------- detalle ----------
  b.push({ h: 2, texto: "Detalle" });
  b.push({ h: 3, texto: "Lectura de texto por documento" });
  b.push({ p: `El OCR tardó ${seg(o.segundosInicio)} en cargarse la primera vez (no se cuenta en el tiempo por página). Los PDF digitales se leen sin OCR: ${pct(res.pdfDigital.acierto)} de palabras correctas, ${seg(res.pdfDigital.segundosPorPagina)} por página. "Escaneos limpios" son los de defecto ${u.ocr.defectos_limpios.join(" o ")}.` });
  b.push({ tabla: { cab: ["Archivo", "Tipo", "Defecto", "Cómo se leyó", "Tiempo por página", "Palabras correctas", "Confianza del OCR"], filas: res.lectura.map((l) => [l.archivo, l.tipo, l.defecto, l.metodo, seg(l.segundosPorPagina), `${pct(l.proporcion)} (${l.palabrasCorrectas} de ${l.palabrasEsperadas})`, l.metodo === "OCR" ? pct(l.confianza) : "—"]) } });

  b.push({ h: 3, texto: "Fechas de vencimiento por documento" });
  b.push({ p: `Idioma detectado bien en ${pct(f.idiomaAcierto)} de los documentos. Fechas no ambiguas que se marcaron para preguntar de más: ${f.preguntasDeMas}.` });
  b.push({ tabla: { cab: ["Archivo", "Idioma", "Esperado", "Leído", "Ambigua", "Resultado"], filas: f.documentos.map((x) => [x.archivo, x.idiomaDetectado === x.idiomaClave ? x.idiomaClave : `${x.idiomaDetectado} (era ${x.idiomaClave})`, x.esperado, x.obtenido, x.ambiguaClave ? (x.ambiguaDetectada ? "sí, se pregunta" : "sí, NO se pregunta") : x.ambiguaDetectada ? "se pregunta de más" : "no", x.bien ? "bien" : "mal"]) } });

  if (c.ok && c.modos) {
    const cc = res.carpeta as { segundosCarga: number; segundosPorDocumento: number; modos: Record<string, { docs: { archivo: string; correcta: string; sugerida: string; top3: string[] }[] }> };
    b.push({ h: 3, texto: "Sugerencia de carpeta por documento" });
    b.push({ p: `Modelo de IA básica cargado en ${seg(cc.segundosCarga)}; ${seg(cc.segundosPorDocumento)} por documento. Las descripciones cortas de cada carpeta están en bench/config.json.` });
    const modos = ["solo_nombre", "nombre_y_descripcion"] as const;
    const docs = cc.modos.solo_nombre.docs;
    b.push({ tabla: { cab: ["Archivo", "Correcta", "Solo nombre", "Nombre y descripción"], filas: docs.map((x, i) => [x.archivo, x.correcta, ...modos.map((m) => { const y = cc.modos[m].docs[i]; return y.sugerida === y.correcta ? `${y.sugerida} (bien)` : `${y.sugerida} (mal)`; })]) } });
  }

  b.push({ h: 3, texto: "Duplicados" });
  b.push({ tabla: { cab: ["Par", "Qué es", "Similitud", "Encontrado"], filas: [
    ...d.esperados.map((x) => [`${x.a} y ${x.b}`, x.clase, x.similitud.toFixed(2), x.encontrado ? `sí (${x.tipo})` : "no"]),
    ...d.falsosPositivos.map((x) => [`${x.a} y ${x.b}`, "documentos distintos", x.similitud.toFixed(2), "falso positivo"]),
  ] } });

  if (s.ok) {
    const sd = res.busqueda as { detalle: { consulta: string; segundos: number; esperados: string[]; hallados: string[]; faltan: string[] }[] };
    b.push({ h: 3, texto: "Búsquedas" });
    b.push({ tabla: { cab: ["Búsqueda", "Tiempo", "Esperados", "Encontrados", "Faltan"], filas: sd.detalle.map((x) => [x.consulta, seg(x.segundos), String(x.esperados.length), String(x.hallados.length), x.faltan.join(", ") || "—"]) } });
  }

  b.push({ h: 3, texto: "Ollama" });
  if (modelos.length) {
    b.push({ tabla: { cab: ["Modelo", "Carga", "Memoria", "Promedio por documento", "Más lento", "Velocidad (tokens por segundo)", "Calidad (1 a 5)"], filas: modelos.map((m) => [m.modelo, seg(m.segundosCarga ?? NaN), m.memoriaGB ? `${m.memoriaGB.toFixed(1)} GB` : "—", seg(m.promedio), seg(m.maximo), Number.isFinite(m.tokensPorSegundo) ? m.tokensPorSegundo.toFixed(0) : "—", Number.isFinite(m.calidad) ? `${m.calidad.toFixed(1)} (${m.calificados} de ${m.resumenes})` : "sin calificar"]) } });
  } else {
    b.push({ p: res.ollama.error ?? "No había modelos instalados." });
  }
  const faltan = res.ollama.modelos.filter((m) => !m.instalado).map((m) => m.modelo);
  if (faltan.length) b.push({ p: `Modelos no medidos porque no estaban instalados: ${faltan.join(", ")}.` });

  return { bloques: b, resumen: filas.map((x) => ({ que: x.que, pasa: x.pasa })) };
}

function aMarkdown(bloques: Bloque[]): string {
  const celda = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  return bloques.map((b) => {
    if ("h" in b) return `${"#".repeat(b.h)} ${b.texto}`;
    if ("p" in b) return b.p;
    if ("lista" in b) return b.lista.map((x) => `- ${x}`).join("\n");
    return [`| ${b.tabla.cab.map(celda).join(" | ")} |`, `| ${b.tabla.cab.map(() => "---").join(" | ")} |`, ...b.tabla.filas.map((f) => `| ${f.map(celda).join(" | ")} |`)].join("\n");
  }).join("\n\n") + "\n";
}

function aHtml(bloques: Bloque[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const chip = (s: string) => s === "PASA" ? `<span class="ok">PASA</span>` : s === "NO PASA" ? `<span class="no">NO PASA</span>` : s === "PENDIENTE" ? `<span class="pen">PENDIENTE</span>` : esc(s);
  const cuerpo = bloques.map((b) => {
    if ("h" in b) return `<h${b.h}>${esc(b.texto)}</h${b.h}>`;
    if ("p" in b) return `<p>${esc(b.p)}</p>`;
    if ("lista" in b) return `<ul>${b.lista.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
    return `<div class="t"><table><thead><tr>${b.tabla.cab.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${b.tabla.filas.map((f) => `<tr>${f.map((c) => `<td>${chip(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }).join("\n");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Informe fase 0</title>
<style>
:root{--fg:#1d1d1f;--bg:#fff;--muted:#f4f4f6;--line:#ddd;--ok:#1a7f37;--no:#c62828;--pen:#9a6700}
@media (prefers-color-scheme: dark){:root{--fg:#eee;--bg:#161618;--muted:#232326;--line:#3a3a3d;--ok:#4ac26b;--no:#ff6b6b;--pen:#e3b341}}
body{font:15px/1.5 system-ui,-apple-system,sans-serif;color:var(--fg);background:var(--bg);max-width:1100px;margin:0 auto;padding:24px 16px}
h1{font-size:26px}h2{margin-top:32px}.t{overflow-x:auto}table{border-collapse:collapse;width:100%;margin:8px 0 16px}
th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{background:var(--muted)}
.ok,.no,.pen{font-weight:700;white-space:nowrap}.ok{color:var(--ok)}.no{color:var(--no)}.pen{color:var(--pen)}
</style></head><body>${cuerpo}</body></html>`;
}

/** Escribe informe.md e informe.html en la carpeta de la corrida y una copia en bench/resultados. */
export function escribirInforme(carpetaCorrida: string, carpetaResultados: string, u: Umbrales) {
  const res = leerJson<Resultados>(join(carpetaCorrida, "resultados.json"));
  const rutaCal = join(carpetaCorrida, "calificaciones.json");
  const cal = existsSync(rutaCal) ? leerJson<Calificaciones>(rutaCal) : {};
  const { bloques, resumen } = construirBloques(res, u, cal);
  const md = aMarkdown(bloques), html = aHtml(bloques);
  for (const dir of [carpetaCorrida, carpetaResultados]) {
    writeFileSync(join(dir, "informe.md"), md);
    writeFileSync(join(dir, "informe.html"), html);
  }
  return { resumen, html: join(carpetaResultados, "informe.html") };
}
