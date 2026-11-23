import os from "node:os";
import { execSync } from "node:child_process";
import type { Equipo } from "./tipos";

export function describirEquipo(navegador: string): Equipo {
  let sistema = `${os.type()} ${os.release()} (${os.arch()})`;
  if (process.platform === "darwin") {
    try { sistema = `macOS ${execSync("sw_vers -productVersion").toString().trim()} (${os.arch()})`; } catch { /* nada */ }
  }
  return {
    sistema,
    procesador: os.cpus()[0]?.model?.trim() ?? "desconocido",
    nucleos: os.cpus().length,
    memoriaGB: Math.round(os.totalmem() / 1024 ** 3),
    navegador,
    fecha: new Date().toISOString(),
  };
}

/** Abre un archivo o una dirección con el programa predeterminado del sistema. */
export function abrir(destino: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? 'start ""' : "xdg-open";
  try { execSync(`${cmd} "${destino}"`, { stdio: "ignore" }); } catch { /* sin pantalla: no pasa nada */ }
}
