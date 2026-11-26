import { describe, expect, it } from "vitest";
import { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from "@zxing/library";
import { code128, valoresCode128, detectarMovidos, formatearCodigo, leerCodigo, numeroDeCodigo } from "../src/codigos";

describe("código del documento", () => {
  it("formatea y reconoce códigos escritos de varias formas", () => {
    expect(formatearCodigo(123)).toBe("DV-000123");
    expect(numeroDeCodigo("DV-000123")).toBe(123);
    for (const t of ["DV-000123", "dv-123", "DV 000123", "dv000123", " 000123 ", "DV'000123", "DV_000123", "https://docvault.app/#DV-000123"]) expect(leerCodigo(t)).toBe("DV-000123");
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

/** Lee las barras con ZXing (otra implementación), como las vería una cámara: 3 px por módulo. */
function leerConZxing(texto: string): string {
  const { barras, ancho } = code128(texto);
  const px = 3, alto = 40, w = ancho * px;
  const lum = new Uint8ClampedArray(w * alto).fill(255);
  for (const b of barras) for (let y = 0; y < alto; y++) lum.fill(0, y * w + b.x * px, y * w + (b.x + b.ancho) * px);
  const fuente = new RGBLuminanceSource(lum, w, alto);
  const pistas = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]]]);
  return new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(fuente)), pistas).getText();
}

describe("Code 128", () => {
  it("usa el juego C para las cifras: DV-000123 es más corto", () => {
    expect(valoresCode128("DV-000123")).toEqual([104, 36, 54, 13, 99, 0, 1, 23, 26, 106]);
    expect(code128("DV-000123").ancho).toBe(132); // antes 154 (solo juego B)
  });
  it("ZXing lee lo que dibujamos", () => {
    for (const t of ["DV-000123", "DV-000001", "DV-999999", "DV-1234567", "ABC", "12345", "A1"]) expect(leerConZxing(t)).toBe(t);
  });
  it("rechaza caracteres que Code 128 no tiene", () => {
    expect(() => code128("Ñ")).toThrow();
  });
});
