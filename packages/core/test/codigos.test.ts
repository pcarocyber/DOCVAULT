import { describe, expect, it } from "vitest";
import { code128, detectarMovidos, formatearCodigo, leerCodigo, numeroDeCodigo } from "../src/codigos";

describe("código del documento", () => {
  it("formatea y reconoce códigos escritos de varias formas", () => {
    expect(formatearCodigo(123)).toBe("DV-000123");
    expect(numeroDeCodigo("DV-000123")).toBe(123);
    for (const t of ["DV-000123", "dv-123", "DV 000123", "dv000123", " 000123 "]) expect(leerCodigo(t)).toBe("DV-000123");
    for (const t of ["123", "2027", "factura", "DV-", "DV-12a"]) expect(leerCodigo(t)).toBeNull();
  });

  it("reconoce un archivo movido o renombrado para que conserve su código", () => {
    const quitados = [
      { ruta: "a/factura.pdf", nombre: "factura.pdf", tamano: 100, modificado: 5, codigo: "DV-000001" },
      { ruta: "a/foto.jpg", nombre: "foto.jpg", tamano: 200, modificado: 6, codigo: "DV-000002" },
      { ruta: "a/otro.pdf", nombre: "otro.pdf", tamano: 300, modificado: 7, codigo: "DV-000003" },
    ];
    const nuevos = [
      { ruta: "Facturas/factura luz.pdf", nombre: "factura luz.pdf", tamano: 100, modificado: 5 }, // renombrado y movido
      { ruta: "Fotos/foto.jpg", nombre: "foto.jpg", tamano: 200, modificado: 99 },                 // movido y tocado
      { ruta: "nuevo.pdf", nombre: "nuevo.pdf", tamano: 300, modificado: 8 },                     // otro archivo
    ];
    const m = detectarMovidos(nuevos, quitados);
    expect(m.get("Facturas/factura luz.pdf")?.codigo).toBe("DV-000001");
    expect(m.get("Fotos/foto.jpg")?.codigo).toBe("DV-000002");
    expect(m.has("nuevo.pdf")).toBe(false);
  });

  it("si dos archivos quitados se parecen igual, no adivina", () => {
    const q = (ruta: string, codigo: string) => ({ ruta, nombre: "copia.pdf", tamano: 10, modificado: 1, codigo });
    const m = detectarMovidos([{ ruta: "x/copia.pdf", nombre: "copia.pdf", tamano: 10, modificado: 1 }], [q("a/copia.pdf", "DV-000001"), q("b/copia.pdf", "DV-000002")]);
    expect(m.size).toBe(0);
  });
});

describe("Code 128", () => {
  it("produce las barras de DV-000123 (verificadas con otra implementación)", () => {
    const { barras, ancho } = code128("DV-000123");
    expect(ancho).toBe(154);
    expect(barras.slice(0, 4)).toEqual([{ x: 10, ancho: 2 }, { x: 13, ancho: 1 }, { x: 16, ancho: 1 }, { x: 21, ancho: 1 }]);
    expect(barras.at(-1)).toEqual({ x: 142, ancho: 2 });
  });
  it("rechaza caracteres que Code 128-B no tiene", () => {
    expect(() => code128("Ñ")).toThrow();
  });
});
