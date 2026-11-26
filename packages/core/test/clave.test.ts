import { describe, expect, it } from "vitest";
import { crearClave, esClaveGuardada, normalizarRecuperacion, nuevoCodigoRecuperacion, problemaDeClave, verificarClave, verificarRecuperacion } from "../src/clave";

describe("contraseña de la bóveda", () => {
  it("verifica la contraseña correcta y rechaza otras", async () => {
    const { guardada, recuperacion } = await crearClave("Pedro2026!", 1000);
    expect(esClaveGuardada(guardada)).toBe(true);
    expect(JSON.stringify(guardada)).not.toContain("Pedro2026");
    expect(await verificarClave(guardada, "Pedro2026!")).toBe(true);
    expect(await verificarClave(guardada, "pedro2026!")).toBe(false);
    expect(await verificarClave(guardada, "")).toBe(false);
    expect(await verificarRecuperacion(guardada, recuperacion)).toBe(true);
    expect(await verificarRecuperacion(guardada, recuperacion.toLowerCase().replace(/-/g, " "))).toBe(true);
    expect(await verificarRecuperacion(guardada, "AAAA-BBBB-CCCC-DDDD")).toBe(false);
  });
  it("dos bóvedas con la misma contraseña guardan huellas distintas", async () => {
    const a = await crearClave("misma clave", 1000), b = await crearClave("misma clave", 1000);
    expect(a.guardada.huella).not.toBe(b.guardada.huella);
  });
  it("código de recuperación legible", () => {
    const c = nuevoCodigoRecuperacion();
    expect(c).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(c).not.toMatch(/[01OIL]/);
    expect(normalizarRecuperacion(" k7qm 2pxd-9rta we4h ")).toBe("K7QM2PXD9RTAWE4H");
  });
  it("pide al menos 6 caracteres", () => {
    expect(problemaDeClave("12345")).toMatch(/6/);
    expect(problemaDeClave("123456")).toBeNull();
  });
});
