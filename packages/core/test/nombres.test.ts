import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * En una Mac (o Windows) "Papelera.tsx" y "papelera.ts" chocan: el disco no
 * distingue mayúsculas, y `import "./Papelera"` puede abrir el archivo
 * equivocado. Esta prueba evita dos módulos con el mismo nombre salvo
 * mayúsculas o extensión en la misma carpeta.
 */
describe("nombres de archivo", () => {
  for (const dir of ["apps/web/src", "packages/core/src", "packages/indice/src"]) {
    it(`no hay nombres que choquen en ${dir}`, () => {
      const nombres = readdirSync(resolve(__dirname, "../../..", dir)).filter((n) => /\.(ts|tsx|js|mjs)$/.test(n));
      const base = nombres.map((n) => n.replace(/\.[^.]+$/, "").toLowerCase());
      const repetidos = base.filter((b, i) => base.indexOf(b) !== i);
      expect(repetidos).toEqual([]);
    });
  }
});
