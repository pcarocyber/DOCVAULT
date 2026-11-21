/**
 * Abre Chrome (o Edge) controlado por Playwright. Usa un perfil propio del banco
 * en bench/.navegador para que el modelo de IA descargado quede guardado.
 */
import { chromium, type BrowserContext } from "playwright";
import { PERFIL_NAVEGADOR } from "./rutas";

export interface NavegadorAbierto { contexto: BrowserContext; nombre: string; version: string }

const CANALES: { canal?: string; nombre: string }[] = [
  { canal: "chrome", nombre: "Google Chrome" },
  { canal: "msedge", nombre: "Microsoft Edge" },
  { nombre: "Chromium de Playwright" },
];

export async function abrirNavegador(visible = false): Promise<NavegadorAbierto> {
  const errores: string[] = [];
  for (const c of CANALES) {
    try {
      const contexto = await chromium.launchPersistentContext(PERFIL_NAVEGADOR, {
        channel: c.canal, headless: !visible, viewport: { width: 1100, height: 800 },
      });
      const version = contexto.browser()?.version() ?? (await versionDesdePagina(contexto));
      return { contexto, nombre: c.nombre, version };
    } catch (e) {
      errores.push(`${c.nombre}: ${String(e).split("\n")[0]}`);
    }
  }
  throw new Error(
    "No encontré Chrome ni Edge.\n" + errores.join("\n") +
    "\nInstala Google Chrome, o ejecuta: npx playwright install chromium",
  );
}

async function versionDesdePagina(contexto: BrowserContext): Promise<string> {
  const p = await contexto.newPage();
  const ua = await p.evaluate(() => navigator.userAgent);
  await p.close();
  return ua.match(/(?:Chrome|Edg)\/([\d.]+)/)?.[1] ?? "desconocida";
}
