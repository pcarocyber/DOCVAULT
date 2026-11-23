/** Leer la carpeta del usuario con la File System Access API (Chrome y Edge). */

export interface ArchivoEncontrado { ruta: string; nombre: string; handle: FileSystemFileHandle; tamano: number; modificado: number }

export const navegadorCompatible = () => typeof window.showDirectoryPicker === "function";

export async function elegirCarpeta(): Promise<FileSystemDirectoryHandle> {
  // En la entrega 1 solo se lee. Escribir (ordenar en carpetas) llega después.
  return window.showDirectoryPicker!({ id: "docvault", mode: "read" });
}

export async function tienePermiso(h: FileSystemDirectoryHandle): Promise<boolean> {
  return (await h.queryPermission({ mode: "read" })) === "granted";
}

export async function pedirPermiso(h: FileSystemDirectoryHandle): Promise<boolean> {
  return (await h.requestPermission({ mode: "read" })) === "granted";
}

/** Recorre la carpeta y sus subcarpetas. Salta archivos y carpetas ocultos. */
export async function recorrer(
  raiz: FileSystemDirectoryHandle, alAvanzar?: (n: number) => void,
): Promise<ArchivoEncontrado[]> {
  const out: ArchivoEncontrado[] = [];
  async function visitar(dir: FileSystemDirectoryHandle, prefijo: string) {
    for await (const h of dir.values()) {
      if (h.name.startsWith(".") || h.name.startsWith("~$")) continue;
      const ruta = prefijo ? `${prefijo}/${h.name}` : h.name;
      if (h.kind === "directory") await visitar(h as FileSystemDirectoryHandle, ruta);
      else {
        const f = await (h as FileSystemFileHandle).getFile();
        out.push({ ruta, nombre: h.name, handle: h as FileSystemFileHandle, tamano: f.size, modificado: f.lastModified });
        alAvanzar?.(out.length);
      }
    }
  }
  await visitar(raiz, "");
  return out;
}

/** Busca un archivo por su ruta relativa dentro de la carpeta. */
export async function archivoPorRuta(raiz: FileSystemDirectoryHandle, ruta: string): Promise<File> {
  const partes = ruta.split("/");
  let dir = raiz;
  for (const p of partes.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
  return (await dir.getFileHandle(partes.at(-1)!)).getFile();
}
