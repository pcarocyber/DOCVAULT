import { describe, expect, it } from "vitest";
import { detectarVencimiento, leerFechas } from "../src/fechas";

describe("leerFechas", () => {
  it("lee fechas escritas en español e inglés", () => {
    expect(leerFechas("vence el 30 de junio de 2027", "es")[0].iso).toBe("2027-06-30");
    expect(leerFechas("expires on August 31, 2027", "en")[0].iso).toBe("2027-08-31");
    expect(leerFechas("RECIBIDO 21 NOV 2026", "es")[0].iso).toBe("2026-11-21");
  });
  it("marca como ambigua 03/04/2027 y la lee según el idioma", () => {
    const es = leerFechas("03/04/2027", "es")[0];
    const en = leerFechas("03/04/2027", "en")[0];
    expect(es).toMatchObject({ iso: "2027-04-03", ambigua: true, otraLectura: "2027-03-04" });
    expect(en).toMatchObject({ iso: "2027-03-04", ambigua: true, otraLectura: "2027-04-03" });
  });
  it("no marca como ambigua una fecha que solo se puede leer de una forma", () => {
    expect(leerFechas("25/04/2027", "en")[0]).toMatchObject({ iso: "2027-04-25", ambigua: false });
    expect(leerFechas("05/05/2027", "es")[0]).toMatchObject({ iso: "2027-05-05", ambigua: false });
  });
  it("descarta fechas imposibles", () => {
    expect(leerFechas("31 de febrero de 2027", "es")).toHaveLength(0);
  });
});

describe("detectarVencimiento", () => {
  it("toma la fecha que sigue a una palabra de vencimiento, no la de emisión", () => {
    const t = "Fecha de emisión: 15 de noviembre de 2026\nFecha límite de pago: 15 de diciembre de 2026";
    expect(detectarVencimiento(t, "es").fecha).toBe("2026-12-15");
  });
  it("ignora la fecha de un sello de recibido", () => {
    expect(detectarVencimiento("RECIBIDO 21 NOV 2026\nSin vencimiento.", "es").fecha).toBeNull();
  });
  it("con un período desde/hasta toma el final", () => {
    expect(detectarVencimiento("The lease begins on September 1, 2026 and ends on August 31, 2027.", "en").fecha).toBe("2027-08-31");
  });
  it("avisa cuando el vencimiento es ambiguo", () => {
    const v = detectarVencimiento("Coverage expires: 03/04/2027.", "en");
    expect(v).toMatchObject({ fecha: "2027-03-04", ambigua: true, otraLectura: "2027-04-03" });
  });
});
