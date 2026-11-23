/** Leer la carpeta del usuario con la File System Access API (Chrome y Edge). */

export interface ArchivoEncontrado { ruta: string; nombre: string; handle: FileSystemFileHandle; tamano: number; modificado: number }

export const navegadorCompatible = () => typeof window.showDirectoryPicker === "function";

export async function elegirCarpeta(): Promise<FileSystemDirectoryHandle> {
  // Se pide solo lectura. El permiso de escritura se pide aparte, la primera vez que se sube o se crea algo.
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

// ---------- Escribir (subir archivos y crear carpetas) ----------

/** Pide permiso para escribir en la carpeta. Debe llamarse desde un clic del usuario. */
export async function pedirEscritura(h: FileSystemDirectoryHandle): Promise<boolean> {
  if ((await h.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return (await h.requestPermission({ mode: "readwrite" })) === "granted";
}

/** Una carpeta de primer nivel dentro de la carpeta del usuario, con su descripción. */
export interface Carpeta { nombre: string; descripcion: string }

const AJUSTES = ".docvault";
const ARCHIVO_CARPETAS = "carpetas.json";

/** Las subcarpetas de primer nivel (sin las ocultas) con la descripción guardada para cada una. */
export async function leerCarpetas(raiz: FileSystemDirectoryHandle): Promise<Carpeta[]> {
  const descripciones = await leerDescripciones(raiz);
  const out: Carpeta[] = [];
  for await (const h of raiz.values()) {
    if (h.kind !== "directory" || h.name.startsWith(".")) continue;
    out.push({ nombre: h.name, descripcion: descripciones[h.name] ?? "" });
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Lee un archivo JSON de .docvault/ dentro de la carpeta del usuario, o null si no existe. */
export async function leerAjusteJson<T>(raiz: FileSystemDirectoryHandle, archivo: string): Promise<T | null> {
  try {
    const dir = await raiz.getDirectoryHandle(AJUSTES);
    const f = await (await dir.getFileHandle(archivo)).getFile();
    return JSON.parse(await f.text()) as T;
  } catch {
    return null;
  }
}

/** Escribe un archivo JSON en .docvault/. Necesita permiso de escritura. */
export async function guardarAjusteJson(raiz: FileSystemDirectoryHandle, archivo: string, datos: unknown) {
  const dir = await raiz.getDirectoryHandle(AJUSTES, { create: true });
  const w = await (await dir.getFileHandle(archivo, { create: true })).createWritable();
  await w.write(JSON.stringify(datos, null, 2));
  await w.close();
}

/** ¿Ya tenemos permiso de escritura? Solo pregunta, nunca muestra el aviso de Chrome. */
export async function puedeEscribir(h: FileSystemDirectoryHandle): Promise<boolean> {
  return (await h.queryPermission({ mode: "readwrite" })) === "granted";
}

async function leerDescripciones(raiz: FileSystemDirectoryHandle): Promise<Record<string, string>> {
  return (await leerAjusteJson<{ carpetas?: Record<string, string> }>(raiz, ARCHIVO_CARPETAS))?.carpetas ?? {};
}

/** Guarda las descripciones en .docvault/carpetas.json, dentro de la propia carpeta del usuario. */
async function guardarDescripcion(raiz: FileSystemDirectoryHandle, nombre: string, descripcion: string) {
  const carpetas = { ...(await leerDescripciones(raiz)), [nombre]: descripcion.trim() };
  await guardarAjusteJson(raiz, ARCHIVO_CARPETAS, { version: 1, carpetas });
}

/** Caracteres que macOS o Windows no aceptan en un nombre de carpeta o archivo. */
export function nombreValido(n: string): string | null {
  const t = n.trim();
  if (!t) return "Escribe un nombre.";
  if (/[\\/:*?"<>|]/.test(t)) return 'El nombre no puede tener \\ / : * ? " < > |';
  if (t.startsWith(".")) return "El nombre no puede empezar con un punto.";
  if (t.length > 80) return "El nombre es muy largo (máximo 80 letras).";
  return null;
}

/** Crea la carpeta (o reutiliza una que ya existe con ese nombre) y guarda su descripción. */
export async function crearCarpeta(raiz: FileSystemDirectoryHandle, nombre: string, descripcion: string): Promise<Carpeta> {
  const n = nombre.trim();
  await raiz.getDirectoryHandle(n, { create: true });
  await guardarDescripcion(raiz, n, descripcion);
  return { nombre: n, descripcion: descripcion.trim() };
}

export async function cambiarDescripcion(raiz: FileSystemDirectoryHandle, nombre: string, descripcion: string) {
  await guardarDescripcion(raiz, nombre, descripcion);
}

/**
 * Copia un archivo dentro de una carpeta. Si ya hay uno con ese nombre, no lo
 * reemplaza: agrega " (2)", " (3)"… antes de la extensión. Devuelve la ruta final.
 */
export async function guardarArchivo(raiz: FileSystemDirectoryHandle, carpeta: string, archivo: File): Promise<{ ruta: string; guardado: File }> {
  const dir = carpeta ? await raiz.getDirectoryHandle(carpeta, { create: true }) : raiz;
  const punto = archivo.name.lastIndexOf(".");
  const base = punto > 0 ? archivo.name.slice(0, punto) : archivo.name;
  const ext = punto > 0 ? archivo.name.slice(punto) : "";
  let nombre = archivo.name;
  for (let i = 2; await existe(dir, nombre); i++) nombre = `${base} (${i})${ext}`;
  const h = await dir.getFileHandle(nombre, { create: true });
  const w = await h.createWritable();
  await w.write(archivo);
  await w.close();
  return { ruta: carpeta ? `${carpeta}/${nombre}` : nombre, guardado: await h.getFile() };
}

async function existe(dir: FileSystemDirectoryHandle, nombre: string): Promise<boolean> {
  try { await dir.getFileHandle(nombre); return true; } catch { return false; }
}
