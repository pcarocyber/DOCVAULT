import { describe, expect, it } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { Indice } from "../src/index";

describe("Indice", () => {
  it("busca sin importar acentos ni mayúsculas", async () => {
    const idx = await Indice.abrir();
    idx.agregar([
      { id: "a", titulo: "FACTURA DE CRÉDITO FISCAL", texto: "Fecha límite de pago: 15 de diciembre" },
      { id: "b", titulo: "PODER ESPECIAL", texto: "otorgo poder especial" },
    ]);
    expect(idx.contar()).toBe(2);
    expect(idx.buscar("credito fiscal").map((h) => h.id)).toEqual(["a"]);
    expect(idx.buscar("LIMITE").map((h) => h.id)).toEqual(["a"]);
    expect(idx.buscar("nada")).toEqual([]);
    idx.cerrar();
  });

  it("reemplazar un documento no lo duplica en la búsqueda", async () => {
    const idx = await Indice.abrir();
    idx.agregar([{ id: "a", titulo: "uno", texto: "contrato viejo" }]);
    idx.agregar([{ id: "a", titulo: "uno", texto: "contrato nuevo" }]);
    expect(idx.buscar("contrato")).toHaveLength(1);
    expect(idx.buscar("viejo")).toHaveLength(0);
    idx.quitar(["a"]);
    expect(idx.contar()).toBe(0);
    expect(idx.buscar("contrato")).toHaveLength(0);
  });

  it("se guarda y se vuelve a abrir con los mismos datos", async () => {
    const idx = await Indice.abrir();
    idx.agregar([{ id: "x/y.pdf", titulo: "y.pdf", texto: "póliza de seguro", ruta: "x/y.pdf", tamano: 10, modificado: 5, tipo: "pdf", estadoTexto: "listo" }]);
    const bytes = idx.exportar();
    idx.cerrar();
    const otro = await Indice.abrir(bytes);
    expect(otro.listar()).toEqual([{ id: "x/y.pdf", titulo: "y.pdf", carpeta: null, ruta: "x/y.pdf", tamano: 10, modificado: 5, tipo: "pdf", estadoTexto: "listo", confianza: null }]);
    expect(otro.buscar("poliza").map((h) => h.id)).toEqual(["x/y.pdf"]);
  });

  it("si los bytes guardados están dañados empieza vacío", async () => {
    const idx = await Indice.abrir(new Uint8Array([1, 2, 3, 4]));
    expect(idx.contar()).toBe(0);
  });

  it("al terminar el OCR cambia el texto, el estado y la confianza sin perder el título", async () => {
    const idx = await Indice.abrir();
    idx.agregar([{ id: "fotos/cedula.jpg", titulo: "fotos/cedula.jpg", texto: "", estadoTexto: "pendiente de OCR" }]);
    idx.ponerTexto("fotos/cedula.jpg", "Cédula de identidad y electoral", "listo", 0.62);
    expect(idx.texto("fotos/cedula.jpg")).toBe("Cédula de identidad y electoral");
    expect(idx.listar()[0]).toMatchObject({ estadoTexto: "listo", confianza: 0.62 });
    expect(idx.buscar("electoral").map((h) => h.id)).toEqual(["fotos/cedula.jpg"]);
    expect(idx.buscar("fotos").map((h) => h.id)).toEqual(["fotos/cedula.jpg"]);
    expect(idx.texto("no existe")).toBeNull();
    idx.cerrar();
  });

  it("un índice de la entrega 1 se abre sin perder nada", async () => {
    const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
    const db = new sqlite3.oo1.DB(":memory:", "c");
    db.exec(`
      CREATE TABLE documentos (id TEXT PRIMARY KEY, titulo TEXT, carpeta TEXT, ruta TEXT,
        tamano INTEGER, modificado INTEGER, tipo TEXT, estado_texto TEXT);
      CREATE VIRTUAL TABLE busqueda USING fts5(id UNINDEXED, titulo, texto, tokenize = 'unicode61 remove_diacritics 2');
      INSERT INTO documentos VALUES ('a.pdf', 'a.pdf', NULL, 'a.pdf', 10, 1, 'pdf', 'listo');
      INSERT INTO busqueda VALUES ('a.pdf', 'a.pdf', 'contrato de alquiler');
      PRAGMA user_version = 2;`);
    const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer!) as Uint8Array;
    db.close();
    const idx = await Indice.abrir(bytes);
    expect(idx.listar()).toEqual([expect.objectContaining({ id: "a.pdf", estadoTexto: "listo", confianza: null })]);
    expect(idx.buscar("alquiler").map((h) => h.id)).toEqual(["a.pdf"]);
    const otra = await Indice.abrir(idx.exportar());
    expect(otra.contar()).toBe(1);
    idx.cerrar(); otra.cerrar();
  });
});
