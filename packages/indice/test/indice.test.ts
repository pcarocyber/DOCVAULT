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
    expect(otro.listar()).toEqual([{ id: "x/y.pdf", titulo: "y.pdf", carpeta: null, ruta: "x/y.pdf", tamano: 10, modificado: 5, tipo: "pdf", estadoTexto: "listo", confianza: null, codigo: null, hash: null, vence: null, venceEstado: null, venceTexto: null, venceOtra: null }]);
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
    expect(idx.listar()).toEqual([expect.objectContaining({ id: "a.pdf", estadoTexto: "listo", confianza: null, codigo: null })]);
    expect(idx.buscar("alquiler").map((h) => h.id)).toEqual(["a.pdf"]);
    const otra = await Indice.abrir(idx.exportar());
    expect(otra.contar()).toBe(1);
    idx.cerrar(); otra.cerrar();
  });
});

describe("Indice: códigos", () => {
  it("guarda el código, lo conserva al releer el documento y lo busca", async () => {
    const idx = await Indice.abrir();
    idx.agregar([{ id: "a.pdf", titulo: "a.pdf", texto: "uno", codigo: "DV-000001" }, { id: "b.pdf", titulo: "b.pdf", texto: "dos" }]);
    idx.agregar([{ id: "a.pdf", titulo: "a.pdf", texto: "uno cambiado" }]); // sin código: conserva el que tenía
    expect(idx.porCodigo("DV-000001")?.id).toBe("a.pdf");
    idx.ponerCodigos(new Map([["b.pdf", "DV-000002"]]));
    expect(idx.listar().map((d) => d.codigo)).toEqual(["DV-000001", "DV-000002"]);
    expect(() => idx.ponerCodigos(new Map([["b.pdf", "DV-000001"]]))).toThrow();
    expect(idx.porCodigo("DV-000002")?.id).toBe("b.pdf");
    idx.ponerAjuste("siguiente_codigo", "3");
    const otra = await Indice.abrir(idx.exportar());
    expect(otra.ajuste("siguiente_codigo")).toBe("3");
    expect(otra.porCodigo("DV-000001")?.id).toBe("a.pdf");
    idx.cerrar(); otra.cerrar();
  });
});

describe("Indice: vencimientos y duplicados", () => {
  it("guarda la fecha detectada y respeta la que decidió el usuario", async () => {
    const idx = await Indice.abrir();
    idx.agregar([{ id: "a.pdf", titulo: "a.pdf", texto: "vence 03/04/2027", hash: "h1", vence: "2027-04-03", venceEstado: "por confirmar", venceTexto: "03/04/2027", venceOtra: "2027-03-04" }]);
    expect(idx.porId("a.pdf")).toMatchObject({ hash: "h1", vence: "2027-04-03", venceEstado: "por confirmar", venceOtra: "2027-03-04" });
    idx.ponerVencimiento("a.pdf", { vence: "2027-03-04", venceEstado: "confirmada", venceTexto: "03/04/2027" }, true);
    // La app vuelve a leer el documento: no pisa la decisión del usuario.
    idx.ponerVencimiento("a.pdf", { vence: "2027-04-03", venceEstado: "por confirmar" });
    idx.agregar([{ id: "a.pdf", titulo: "a.pdf", texto: "vence 03/04/2027 (cambiado)", hash: "h2", vence: "2027-04-03", venceEstado: "por confirmar" }]);
    expect(idx.porId("a.pdf")).toMatchObject({ hash: "h2", vence: "2027-03-04", venceEstado: "confirmada" });
    expect(idx.paraComparar()).toEqual([{ id: "a.pdf", hash: "h2", texto: "vence 03/04/2027 (cambiado)" }]);
    idx.cerrar();
  });

  it("un índice de la entrega 3 se abre sin perder los códigos", async () => {
    const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
    const db = new sqlite3.oo1.DB(":memory:", "c");
    db.exec(`
      CREATE TABLE documentos (id TEXT PRIMARY KEY, titulo TEXT, carpeta TEXT, ruta TEXT,
        tamano INTEGER, modificado INTEGER, tipo TEXT, estado_texto TEXT, confianza REAL, codigo TEXT);
      CREATE UNIQUE INDEX documentos_codigo ON documentos(codigo);
      CREATE TABLE ajustes (clave TEXT PRIMARY KEY, valor TEXT);
      CREATE VIRTUAL TABLE busqueda USING fts5(id UNINDEXED, titulo, texto, tokenize = 'unicode61 remove_diacritics 2');
      INSERT INTO documentos VALUES ('a.pdf', 'a.pdf', NULL, 'a.pdf', 10, 1, 'pdf', 'listo', NULL, 'DV-000001');
      INSERT INTO busqueda VALUES ('a.pdf', 'a.pdf', 'contrato de alquiler');
      PRAGMA user_version = 4;`);
    const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer!) as Uint8Array;
    db.close();
    const idx = await Indice.abrir(bytes);
    expect(idx.listar()).toEqual([expect.objectContaining({ id: "a.pdf", codigo: "DV-000001", hash: null, venceEstado: null })]);
    idx.cerrar();
  });
});
