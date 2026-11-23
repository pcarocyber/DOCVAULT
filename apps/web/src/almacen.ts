/**
 * Lo que la app guarda en el navegador (nunca sale del equipo):
 * - en IndexedDB, el "permiso" a la carpeta elegida, para no pedirla cada vez;
 * - en OPFS (almacenamiento privado del navegador), el archivo del índice.
 */

const BD = "docvault";
const TABLA = "ajustes";

function abrirBD(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(TABLA);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

async function leer<T>(clave: string): Promise<T | undefined> {
  const bd = await abrirBD();
  return new Promise((ok, mal) => {
    const r = bd.transaction(TABLA).objectStore(TABLA).get(clave);
    r.onsuccess = () => ok(r.result as T | undefined);
    r.onerror = () => mal(r.error);
  });
}

async function escribir(clave: string, valor: unknown): Promise<void> {
  const bd = await abrirBD();
  return new Promise((ok, mal) => {
    const t = bd.transaction(TABLA, "readwrite");
    t.objectStore(TABLA).put(valor, clave);
    t.oncomplete = () => ok();
    t.onerror = () => mal(t.error);
  });
}

export const leerCarpetaRecordada = () => leer<FileSystemDirectoryHandle>("carpeta");
export const recordarCarpeta = (h: FileSystemDirectoryHandle) => escribir("carpeta", h);

const ARCHIVO_INDICE = "indice.sqlite";

export async function leerIndiceGuardado(): Promise<Uint8Array | null> {
  try {
    const raiz = await navigator.storage.getDirectory();
    const h = await raiz.getFileHandle(ARCHIVO_INDICE);
    return new Uint8Array(await (await h.getFile()).arrayBuffer());
  } catch {
    return null;
  }
}

export async function guardarIndice(bytes: Uint8Array): Promise<void> {
  const raiz = await navigator.storage.getDirectory();
  const h = await raiz.getFileHandle(ARCHIVO_INDICE, { create: true });
  const w = await h.createWritable();
  await w.write(bytes as Uint8Array<ArrayBuffer>);
  await w.close();
}

export async function borrarIndiceGuardado(): Promise<void> {
  try { await (await navigator.storage.getDirectory()).removeEntry(ARCHIVO_INDICE); } catch { /* no existía */ }
}

/** Pide al navegador que no borre nuestros datos si el disco se llena. */
export async function pedirAlmacenamientoPersistente(): Promise<boolean> {
  try { return (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch { return false; }
}
