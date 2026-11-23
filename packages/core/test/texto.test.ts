import { describe, expect, it } from "vitest";
import { palabrasCorrectas, plano } from "../src/texto";
import { detectarIdioma } from "../src/idioma";
import { huella, jaccard } from "../src/duplicados";
import { sugerirPorNombre } from "../src/carpeta";

describe("texto", () => {
  it("plano quita acentos sin cambiar la longitud", () => {
    expect(plano("Válido HASTA")).toBe("valido hasta");
    expect(plano("Ñandú").length).toBe("Ñandú".length);
  });
  it("cuenta palabras correctas aunque falte o sobre alguna", () => {
    const r = palabrasCorrectas("el contrato vence el 30 de junio", "el contrato vence 30 de junlo extra");
    expect(r.esperadas).toBe(7);
    expect(r.correctas).toBe(5);
  });
});

describe("idioma", () => {
  it("distingue español de inglés", () => {
    expect(detectarIdioma("El presente contrato tiene una duración de doce meses").idioma).toBe("es");
    expect(detectarIdioma("This agreement remains in force for two years").idioma).toBe("en");
  });
});

describe("duplicados", () => {
  it("un cambio pequeño da similitud alta y textos distintos dan similitud baja", () => {
    const a = huella("Factura B0100004521. Resmas de papel carta 20 unidades. Total RD$ 7,000.00");
    const b = huella("Factura B0100004521. Resmas de papel carta 25 unidades. Total RD$ 8,750.00");
    const c = huella("Limited power of attorney for the sale of the property");
    expect(jaccard(a, b)).toBeGreaterThan(0.5);
    expect(jaccard(a, c)).toBeLessThan(0.1);
  });
});

describe("carpeta", () => {
  it("ordena las carpetas por parecido", () => {
    const r = sugerirPorNombre([1, 0], [[0, 1], [0.9, 0.1]], ["A", "B"]);
    expect(r[0].carpeta).toBe("B");
  });
});
