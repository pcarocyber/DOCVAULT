/**
 * La contraseña de la bóveda vive en .docvault/clave.json dentro de la carpeta del
 * usuario (solo su huella, nunca la contraseña), así viaja con la bóveda.
 */
import { esClaveGuardada, type ClaveGuardada } from "@docvault/core";
import { guardarAjusteJson, leerAjusteJson, pedirEscritura } from "./carpeta";

const ARCHIVO = "clave.json";

export async function leerClave(raiz: FileSystemDirectoryHandle): Promise<ClaveGuardada | null> {
  const g = await leerAjusteJson<unknown>(raiz, ARCHIVO);
  return esClaveGuardada(g) ? g : null;
}

/** Pide permiso de escritura si hace falta. Llamar dentro de un clic. */
export async function permisoParaGuardar(raiz: FileSystemDirectoryHandle): Promise<boolean> {
  return pedirEscritura(raiz);
}

export async function guardarClave(raiz: FileSystemDirectoryHandle, g: ClaveGuardada): Promise<void> {
  await guardarAjusteJson(raiz, ARCHIVO, g);
}

export async function quitarClave(raiz: FileSystemDirectoryHandle): Promise<void> {
  const dir = await raiz.getDirectoryHandle(".docvault");
  await dir.removeEntry(ARCHIVO);
}
