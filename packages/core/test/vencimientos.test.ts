import { describe, expect, it } from "vitest";
import { analizarVencimiento, cuandoVence, diasHasta, etapa, fechaCorta, fechaLarga, fechaValida, hoyIso } from "../src/vencimientos";

describe("vencimientos", () => {
  it("detecta la fecha y el idioma del documento", () => {
    expect(analizarVencimiento("Contrato de arrendamiento. Vence el 30 de junio de 2027.")).toMatchObject({ vence: "2027-06-30", venceEstado: "detectada" });
    expect(analizarVencimiento("This policy expires on 03/04/2027 for the insured.")).toMatchObject({ vence: "2027-03-04", venceEstado: "por confirmar", venceOtra: "2027-04-03" });
    expect(analizarVencimiento("Póliza vigente hasta 03/04/2027 para el asegurado.")).toMatchObject({ vence: "2027-04-03", venceEstado: "por confirmar", venceOtra: "2027-03-04" });
    expect(analizarVencimiento("Estado de cuenta del mes")).toMatchObject({ vence: null, venceEstado: "no detectada" });
  });
  it("cuenta los días y la etapa", () => {
    expect(diasHasta("2026-12-01", "2026-11-26")).toBe(5);
    expect(diasHasta("2027-03-01", "2027-02-28")).toBe(1);
    expect(etapa("2026-11-25", "2026-11-26")).toBe("vencido");
    expect(etapa("2026-11-26", "2026-11-26")).toBe("esta semana");
    expect(etapa("2026-12-20", "2026-11-26")).toBe("este mes");
    expect(etapa("2027-01-30", "2026-11-26")).toBe("más adelante");
  });
  it("lo escribe para leer", () => {
    expect(cuandoVence("2026-11-26", "2026-11-26")).toBe("vence hoy");
    expect(cuandoVence("2026-11-27", "2026-11-26")).toBe("vence mañana");
    expect(cuandoVence("2026-12-08", "2026-11-26")).toBe("vence en 12 días");
    expect(cuandoVence("2026-11-23", "2026-11-26")).toBe("venció hace 3 días");
    expect(fechaCorta("2027-04-03")).toBe("3 abr 2027");
    expect(fechaLarga("2027-04-03")).toBe("3 de abril de 2027");
    expect(hoyIso(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  it("valida fechas escritas a mano", () => {
    expect(fechaValida("2027-02-28")).toBe(true);
    expect(fechaValida("2027-02-30")).toBe(false);
    expect(fechaValida("")).toBe(false);
  });
});
