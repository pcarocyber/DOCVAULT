/**
 * Contraseña de la bóveda. Se guarda solo una huella (PBKDF2-SHA256 con sal), nunca la
 * contraseña. Protege el acceso desde la app: los archivos de la carpeta no se cifran.
 */
export const ITERACIONES = 600_000;

export interface ClaveGuardada {
  version: 1;
  iteraciones: number;
  sal: string;          // base64
  huella: string;       // base64
  salRecuperacion: string;
  huellaRecuperacion: string;
  creada: string;       // fecha ISO
}

const aB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function huella(texto: string, sal: Uint8Array, iteraciones: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(texto.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal as Uint8Array<ArrayBuffer>, iterations: iteraciones }, base, 256);
  return new Uint8Array(bits);
}

function iguales(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

/** Letras y números sin los que se confunden (0/O, 1/I/L). */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Código de recuperación de 16 caracteres en 4 grupos: «K7QM-2PXD-9RTA-WE4H». */
export function nuevoCodigoRecuperacion(): string {
  const azar = crypto.getRandomValues(new Uint8Array(16));
  const c = [...azar].map((b) => ALFABETO[b % ALFABETO.length]).join("");
  return c.match(/.{4}/g)!.join("-");
}

/** El código como lo escriba la persona: sin espacios ni guiones, en mayúsculas. */
export function normalizarRecuperacion(c: string): string {
  return c.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export const MINIMO_CLAVE = 6;

export function problemaDeClave(clave: string): string | null {
  if (clave.length < MINIMO_CLAVE) return `Usa al menos ${MINIMO_CLAVE} caracteres.`;
  return null;
}

/** Crea el registro a guardar. Devuelve también el código de recuperación (se muestra una sola vez). */
export async function crearClave(clave: string, iteraciones = ITERACIONES): Promise<{ guardada: ClaveGuardada; recuperacion: string }> {
  const recuperacion = nuevoCodigoRecuperacion();
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const salR = crypto.getRandomValues(new Uint8Array(16));
  return {
    recuperacion,
    guardada: {
      version: 1,
      iteraciones,
      sal: aB64(sal),
      huella: aB64(await huella(clave, sal, iteraciones)),
      salRecuperacion: aB64(salR),
      huellaRecuperacion: aB64(await huella(normalizarRecuperacion(recuperacion), salR, iteraciones)),
      creada: new Date().toISOString(),
    },
  };
}

export async function verificarClave(g: ClaveGuardada, clave: string): Promise<boolean> {
  return iguales(await huella(clave, deB64(g.sal), g.iteraciones), deB64(g.huella));
}

export async function verificarRecuperacion(g: ClaveGuardada, codigo: string): Promise<boolean> {
  return iguales(await huella(normalizarRecuperacion(codigo), deB64(g.salRecuperacion), g.iteraciones), deB64(g.huellaRecuperacion));
}

export function esClaveGuardada(x: unknown): x is ClaveGuardada {
  const g = x as ClaveGuardada | null;
  return !!g && g.version === 1 && typeof g.huella === "string" && typeof g.sal === "string" && typeof g.iteraciones === "number";
}
