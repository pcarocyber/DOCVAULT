/**
 * Papelera de DOCVAULT: cuando el usuario confirma que dos documentos son
 * duplicados y quita uno, el archivo no se borra. Se mueve a
 * .docvault/papelera/ dentro de su carpeta (la app no indexa carpetas ocultas),
 * y desde la app se puede recuperar a su lugar o borrar para siempre.
 */
import type { Indice } from "@docvault/indice";
import { guardarAjusteJson, leerAjusteJson, pedirEscritura } from "./carpeta";

const ARCHIVO = "papelera.json";
const DIR = "papelera";

export interface EnPapelera {
  /** Nombre del archivo dentro de .docvault/papelera/ (único). */
  guardadoComo: string;
  /** Dónde estaba en la carpeta del usuario. */
  ruta: string;
  codigo: string | null;
  /** Fecha y hora en que se quitó (ISO). */
  quitado: string;
  motivo: string;
}

interface Guardada { version: 1; archivos: EnPapelera[] }

export async function leerPapelera(raiz: FileSystemDirectoryHandle): Promise<EnPapelera[]> {
  return (await leerAjusteJson<Guardada>(raiz, ARCHIVO))?.archivos ?? [];
}

async function escribirLista(raiz: FileSystemDirectoryHandle, archivos: EnPapelera[]) {
  await guardarAjusteJson(raiz, ARCHIVO, { version: 1, archivos } satisfies Guardada);
}

async function dirDe(raiz: FileSystemDirectoryHandle, ruta: string, crear = false): Promise<FileSystemDirectoryHandle> {
  let dir = raiz;
  for (const p of ruta.split("/").slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: crear });
  return dir;
}

async function carpetaPapelera(raiz: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  return (await raiz.getDirectoryHandle(".docvault", { create: true })).getDirectoryHandle(DIR, { create: true });
}

async function copiar(origen: File, destino: FileSystemFileHandle) {
  const w = await destino.createWritable();
  await w.write(origen);
  await w.close();
}

/**
 * Mueve un documento a la papelera y lo quita del índice. Pide permiso de
 * escritura si todavía no lo hay (debe llamarse desde un clic).
 */
export async function moverAPapelera(raiz: FileSystemDirectoryHandle, indice: Indice, id: string, motivo: string): Promise<EnPapelera> {
  if (!(await pedirEscritura(raiz))) throw new Error("Sin permiso para escribir en la carpeta no puedo mover el archivo a la papelera.");
  const doc = indice.porId(id);
  const nombre = id.split("/").at(-1)!;
  const dir = await dirDe(raiz, id);
  const original = await (await dir.getFileHandle(nombre)).getFile();
  const papelera = await carpetaPapelera(raiz);
  const guardadoComo = `${Date.now()}-${nombre}`;
  // Primero la copia en la papelera; solo si salió bien se quita el original.
  await copiar(original, await papelera.getFileHandle(guardadoComo, { create: true }));
  const copia = await (await papelera.getFileHandle(guardadoComo)).getFile();
  if (copia.size !== original.size) {
    await papelera.removeEntry(guardadoComo);
    throw new Error("No se pudo copiar el archivo a la papelera; no se quitó nada.");
  }
  await dir.removeEntry(nombre);
  const entrada: EnPapelera = { guardadoComo, ruta: id, codigo: doc?.codigo ?? null, quitado: new Date().toISOString(), motivo };
  await escribirLista(raiz, [...(await leerPapelera(raiz)), entrada]);
  indice.quitar([id]);
  return entrada;
}

/**
 * Devuelve un archivo a su lugar. Si ya hay otro con ese nombre, agrega " (2)".
 * Devuelve la ruta donde quedó y el archivo; el índice lo agrega quien llama.
 */
export async function recuperar(raiz: FileSystemDirectoryHandle, e: EnPapelera): Promise<{ ruta: string; archivo: File }> {
  if (!(await pedirEscritura(raiz))) throw new Error("Sin permiso para escribir en la carpeta no puedo recuperar el archivo.");
  const papelera = await carpetaPapelera(raiz);
  const archivo = await (await papelera.getFileHandle(e.guardadoComo)).getFile();
  const dir = await dirDe(raiz, e.ruta, true);
  const nombreOriginal = e.ruta.split("/").at(-1)!;
  const punto = nombreOriginal.lastIndexOf(".");
  const base = punto > 0 ? nombreOriginal.slice(0, punto) : nombreOriginal;
  const ext = punto > 0 ? nombreOriginal.slice(punto) : "";
  let nombre = nombreOriginal;
  for (let i = 2; await existe(dir, nombre); i++) nombre = `${base} (${i})${ext}`;
  const h = await dir.getFileHandle(nombre, { create: true });
  await copiar(new File([archivo], nombre, { lastModified: archivo.lastModified }), h);
  await papelera.removeEntry(e.guardadoComo);
  await escribirLista(raiz, (await leerPapelera(raiz)).filter((x) => x.guardadoComo !== e.guardadoComo));
  const partes = e.ruta.split("/").slice(0, -1);
  return { ruta: [...partes, nombre].join("/"), archivo: await h.getFile() };
}

/** Borra para siempre un archivo de la papelera. */
export async function borrarParaSiempre(raiz: FileSystemDirectoryHandle, e: EnPapelera): Promise<void> {
  if (!(await pedirEscritura(raiz))) throw new Error("Sin permiso para escribir en la carpeta no puedo borrar el archivo.");
  const papelera = await carpetaPapelera(raiz);
  try { await papelera.removeEntry(e.guardadoComo); } catch { /* ya no estaba */ }
  await escribirLista(raiz, (await leerPapelera(raiz)).filter((x) => x.guardadoComo !== e.guardadoComo));
}

async function existe(dir: FileSystemDirectoryHandle, nombre: string): Promise<boolean> {
  try { await dir.getFileHandle(nombre); return true; } catch { return false; }
}
