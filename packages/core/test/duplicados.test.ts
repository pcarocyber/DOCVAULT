import { describe, expect, it } from "vitest";
import { compararConBoveda, duplicadosEnBoveda, UMBRALES_DUPLICADOS } from "../src/duplicados";

const base = "CONTRATO DE ARRENDAMIENTO DE LOCAL COMERCIAL entre Inmobiliaria Ejemplo SRL y Farmacia Nueva Aurora. El arrendatario pagará RD$ 45,000.00 mensuales. Vence el 30 de junio de 2027. Firmado en Santo Domingo.";
const ocr = base.replace("Farmacia", "Farrnacia").replace("45,000.00", "45.000,00");
const version = base.replace("45,000.00", "52,000.00").replace("30 de junio de 2027", "30 de junio de 2028") + " Adenda: se renueva por un año más con las mismas condiciones.";
const otro = "PODER ESPECIAL que otorga el señor Juan Ejemplo a favor de la Lcda. Ana Ejemplo Batista para vender el vehículo Toyota placa A123456 ante la DGII.";

describe("duplicados en la bóveda", () => {
  const docs = [
    { id: "a.pdf", hash: "h1", texto: base },
    { id: "copia de a.pdf", hash: "h1", texto: base },
    { id: "a escaneado.pdf", hash: "h2", texto: ocr },
    { id: "a 2028.pdf", hash: "h3", texto: version },
    { id: "poder.pdf", hash: "h4", texto: otro },
    { id: "foto.jpg", hash: "h5", texto: "" },
  ];
  it("encuentra copias exactas, escaneos repetidos y versiones, sin falsos positivos", () => {
    const pares = duplicadosEnBoveda(docs, UMBRALES_DUPLICADOS);
    const ver = (a: string, b: string) => pares.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
    expect(ver("a.pdf", "copia de a.pdf")?.tipo).toBe("exacto");
    expect(ver("a.pdf", "a escaneado.pdf")?.tipo).toBe("casi idéntico");
    expect(ver("a.pdf", "a 2028.pdf")?.tipo).toBe("parecido");
    expect(pares.some((p) => p.a === "poder.pdf" || p.b === "poder.pdf")).toBe(false);
    expect(pares.some((p) => p.a === "foto.jpg" || p.b === "foto.jpg")).toBe(false);
  });
  it("usa la memoria de huellas entre una revisión y otra", () => {
    const cache = new Map();
    const uno = duplicadosEnBoveda(docs, UMBRALES_DUPLICADOS, cache);
    expect(cache.size).toBe(5);
    expect(duplicadosEnBoveda(docs, UMBRALES_DUPLICADOS, cache)).toEqual(uno);
  });
  it("compara un archivo nuevo con lo que ya está", () => {
    expect(compararConBoveda({ hash: "h1", texto: base }, docs, UMBRALES_DUPLICADOS)[0]).toMatchObject({ id: "a.pdf", tipo: "exacto" });
    expect(compararConBoveda({ hash: "zz", texto: otro + " " }, docs, UMBRALES_DUPLICADOS)[0]).toMatchObject({ id: "poder.pdf", tipo: "casi idéntico" });
    expect(compararConBoveda({ hash: "zz", texto: "Recibo de pago del alquiler de octubre por RD$ 12,000.00 a nombre de Pedro Ejemplo, en efectivo." }, docs, UMBRALES_DUPLICADOS)).toEqual([]);
  });
});
