import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extraerTextoDocx, extraerTextoXlsx } from "../src/oficina";

const datos = (n: string) => new Uint8Array(readFileSync(new URL(`./datos/${n}`, import.meta.url)));

describe("Word (.docx)", () => {
  it("lee párrafos, tablas y encabezados de un archivo real", () => {
    const t = extraerTextoDocx(datos("ejemplo.docx"));
    expect(t).toContain("Contrato de arrendamiento");
    expect(t).toContain("El inquilino pagará RD$25,000 & gastos");
    expect(t).toContain("15/03/2027");
    expect(t).toContain("Notaría Pérez");
    expect(t.indexOf("Contrato")).toBeLessThan(t.indexOf("Notaría"));
  });

  it("un archivo que no es ZIP lanza error", () => {
    expect(() => extraerTextoDocx(strToU8("no soy un docx"))).toThrow();
  });
});

describe("Excel (.xlsx)", () => {
  it("lee las hojas con su nombre y los textos compartidos de un archivo real", () => {
    const t = extraerTextoXlsx(datos("ejemplo.xlsx"));
    expect(t).toContain("Facturas");
    expect(t).toContain("NCF\tMonto\tCliente");
    expect(t).toContain("B0100004521\t1500.5\tSeñora Núñez");
    expect(t).toContain("Notas\ncrédito fiscal <pendiente>");
  });

  it("lee celdas con texto en línea", () => {
    const zip = zipSync({
      "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Hoja1" sheetId="1"/></sheets></workbook>'),
      "xl/worksheets/sheet1.xml": strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Póliza 123</t></is></c><c r="B1"/></row></sheetData></worksheet>'),
    });
    expect(extraerTextoXlsx(zip)).toBe("Hoja1\nPóliza 123");
  });
});
