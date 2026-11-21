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
});
