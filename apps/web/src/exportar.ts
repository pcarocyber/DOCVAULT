/** Exporta el índice a un Excel (.xlsx) con el código de cada documento. Se crea en el navegador. */
import type { FichaDocumento } from "@docvault/indice";
import { crearXlsx, type Celda } from "@docvault/core";

const ESTADO: Record<string, string> = {
  "listo": "Con texto",
  "sin texto": "Sin texto",
  "pendiente de OCR": "Espera OCR",
  "formato no soportado": "Solo nombre",
  "error": "No se pudo leer",
};

export function filasIndice(docs: FichaDocumento[]): Celda[][] {
  const orden = [...docs].sort((a, b) => (a.codigo ?? "~").localeCompare(b.codigo ?? "~") || a.id.localeCompare(b.id));
  return [
    ["Código", "Nombre", "Carpeta", "Ruta", "Tipo", "Tamaño (KB)", "Modificado", "Texto", "Confianza OCR (%)"],
    ...orden.map((d): Celda[] => [
      d.codigo,
      d.id.split("/").at(-1) ?? d.id,
      d.carpeta ?? "",
      d.id,
      (d.tipo || "").toUpperCase(),
      d.tamano != null ? Math.round(d.tamano / 102.4) / 10 : null,
      d.modificado ? new Date(d.modificado).toLocaleDateString("es-DO") : "",
      ESTADO[d.estadoTexto ?? ""] ?? "",
      d.confianza != null ? Math.round(d.confianza * 100) : null,
    ]),
  ];
}

export function nombreExcel(fecha = new Date()): string {
  const f = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
  // Sin acentos: algunos Chrome cambian por "download" un nombre con letras fuera del ASCII.
  return `DOCVAULT indice ${f}.xlsx`;
}

export function descargarExcel(docs: FichaDocumento[]): void {
  const bytes = crearXlsx([{ nombre: "Documentos", filas: filasIndice(docs), anchos: [12, 40, 20, 50, 8, 12, 12, 14, 18] }]);
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreExcel();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
