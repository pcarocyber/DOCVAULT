import { describe, expect, it } from "vitest";
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
    expect(otro.listar()).toEqual([{ id: "x/y.pdf", titulo: "y.pdf", carpeta: null, ruta: "x/y.pdf", tamano: 10, modificado: 5, tipo: "pdf", estadoTexto: "listo" }]);
    expect(otro.buscar("poliza").map((h) => h.id)).toEqual(["x/y.pdf"]);
  });

  it("si los bytes guardados están dañados empieza vacío", async () => {
    const idx = await Indice.abrir(new Uint8Array([1, 2, 3, 4]));
    expect(idx.contar()).toBe(0);
  });
});
