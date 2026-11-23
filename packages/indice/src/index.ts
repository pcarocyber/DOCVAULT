/**
 * Índice local: SQLite en WebAssembly con FTS5 (búsqueda por palabras).
 * La base vive en memoria mientras la app está abierta y se guarda como un
 * archivo (bytes) en el almacenamiento privado del navegador (OPFS).
 * Siempre se puede reconstruir leyendo la carpeta del usuario.
 */
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

export interface DocIndice {
  id: string;            // en la app: la ruta relativa dentro de la carpeta
  titulo: string;
  texto: string;
  carpeta?: string;
  ruta?: string;
  tamano?: number;
  modificado?: number;   // milisegundos desde 1970
  tipo?: string;         // extensión en minúsculas: pdf, jpg, docx…
  estadoTexto?: EstadoTexto;
  /** Solo para texto leído con OCR: de 0 a 1. Por debajo de 0,7 conviene revisarlo. */
  confianza?: number;
}

/** Cómo se obtuvo el texto del documento. */
export type EstadoTexto = "listo" | "sin texto" | "pendiente de OCR" | "formato no soportado" | "error";

export interface FichaDocumento {
  id: string; titulo: string; carpeta: string | null; ruta: string | null; tamano: number | null;
  modificado: number | null; tipo: string | null; estadoTexto: EstadoTexto | null; confianza: number | null;
}

/** `fragmento` marca las palabras halladas entre los caracteres \u0002 y \u0003. */
export interface Hallazgo { id: string; titulo: string; fragmento: string; puntaje: number }

const VERSION_ESQUEMA = 3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sqlite = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

let modulo: Promise<Sqlite> | null = null;
function cargarSqlite(): Promise<Sqlite> {
  modulo ??= sqlite3InitModule({ print: () => {}, printErr: () => {} });
  return modulo;
}

function crearEsquema(db: Db) {
  db.exec(`
    DROP TABLE IF EXISTS documentos;
    DROP TABLE IF EXISTS busqueda;
    CREATE TABLE documentos (
      id TEXT PRIMARY KEY, titulo TEXT, carpeta TEXT, ruta TEXT,
      tamano INTEGER, modificado INTEGER, tipo TEXT, estado_texto TEXT, confianza REAL
    );
    CREATE VIRTUAL TABLE busqueda USING fts5(
      id UNINDEXED, titulo, texto, tokenize = 'unicode61 remove_diacritics 2'
    );
    PRAGMA user_version = ${VERSION_ESQUEMA};
  `);
}

export class Indice {
  private constructor(private sqlite: Sqlite, private db: Db) {}

  /**
   * Abre un índice vacío, o uno guardado antes (los bytes de `exportar()`).
   * Si los bytes están dañados o son de otra versión, empieza vacío.
   */
  static async abrir(guardado?: Uint8Array | null): Promise<Indice> {
    const sqlite3 = await cargarSqlite();
    if (guardado && guardado.byteLength > 0) {
      try {
        const db = new sqlite3.oo1.DB(":memory:", "c");
        const p = sqlite3.wasm.allocFromTypedArray(guardado);
        const rc = sqlite3.capi.sqlite3_deserialize(
          db.pointer, "main", p, guardado.byteLength, guardado.byteLength,
          sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
        );
        db.checkRc(rc);
        const version = db.selectValue("PRAGMA user_version");
        if (version === 2) {
          // entrega 1 → entrega 2: solo se agrega la columna de confianza del OCR
          db.exec(`ALTER TABLE documentos ADD COLUMN confianza REAL; PRAGMA user_version = ${VERSION_ESQUEMA};`);
          return new Indice(sqlite3, db);
        }
        if (version === VERSION_ESQUEMA) return new Indice(sqlite3, db);
        db.close();
      } catch {
        // índice dañado: se reconstruye desde la carpeta
      }
    }
    const db = new sqlite3.oo1.DB(":memory:", "c");
    crearEsquema(db);
    return new Indice(sqlite3, db);
  }

  /** Los bytes de la base, para guardarlos en OPFS. */
  exportar(): Uint8Array {
    return this.sqlite.capi.sqlite3_js_db_export(this.db.pointer) as Uint8Array;
  }

  /** Agrega o reemplaza documentos (por id). */
  agregar(docs: DocIndice[]): void {
    this.db.exec("BEGIN");
    try {
      for (const d of docs) {
        this.db.exec({
          sql: `INSERT OR REPLACE INTO documentos (id, titulo, carpeta, ruta, tamano, modificado, tipo, estado_texto, confianza)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          bind: [d.id, d.titulo, d.carpeta ?? null, d.ruta ?? null, d.tamano ?? null, d.modificado ?? null, d.tipo ?? null, d.estadoTexto ?? null, d.confianza ?? null],
        });
        this.db.exec({ sql: "DELETE FROM busqueda WHERE id = ?", bind: [d.id] });
        this.db.exec({ sql: "INSERT INTO busqueda (id, titulo, texto) VALUES (?, ?, ?)", bind: [d.id, d.titulo, d.texto] });
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  quitar(ids: string[]): void {
    this.db.exec("BEGIN");
    for (const id of ids) {
      this.db.exec({ sql: "DELETE FROM documentos WHERE id = ?", bind: [id] });
      this.db.exec({ sql: "DELETE FROM busqueda WHERE id = ?", bind: [id] });
    }
    this.db.exec("COMMIT");
  }

  /** Todos los documentos, ordenados por ruta. */
  listar(): FichaDocumento[] {
    const filas: FichaDocumento[] = [];
    this.db.exec({
      sql: `SELECT id, titulo, carpeta, ruta, tamano, modificado, tipo, estado_texto AS estadoTexto, confianza
            FROM documentos ORDER BY coalesce(ruta, id)`,
      rowMode: "object",
      callback: (f: FichaDocumento) => { filas.push({ ...f }); },
    });
    return filas;
  }

  /** Busca documentos que contienen todas las palabras (sin importar acentos ni mayúsculas). */
  buscar(consulta: string, limite = 10): Hallazgo[] {
    const terminos = consulta
      .split(/\s+/)
      .map((t) => t.replace(/"/g, "").trim())
      .filter(Boolean)
      .map((t) => `"${t}"`);
    if (terminos.length === 0) return [];
    const filas: Hallazgo[] = [];
    this.db.exec({
      sql: `SELECT id, titulo, snippet(busqueda, -1, char(2), char(3), '…', 14) AS fragmento, bm25(busqueda) AS puntaje
            FROM busqueda WHERE busqueda MATCH ? ORDER BY puntaje LIMIT ?`,
      bind: [terminos.join(" "), limite],
      rowMode: "object",
      callback: (f: Hallazgo) => { filas.push({ ...f }); },
    });
    return filas;
  }

  /** El texto guardado de un documento, o null si no está en el índice. */
  texto(id: string): string | null {
    return (this.db.selectValue("SELECT texto FROM busqueda WHERE id = ?", [id]) as string | undefined) ?? null;
  }

  /** Cambia solo el texto de un documento ya indexado (por ejemplo, al terminar su OCR). */
  ponerTexto(id: string, texto: string, estado: EstadoTexto, confianza: number | null): void {
    this.db.exec("BEGIN");
    try {
      this.db.exec({ sql: "UPDATE documentos SET estado_texto = ?, confianza = ? WHERE id = ?", bind: [estado, confianza, id] });
      const titulo = this.db.selectValue("SELECT titulo FROM busqueda WHERE id = ?", [id]) as string | undefined;
      this.db.exec({ sql: "DELETE FROM busqueda WHERE id = ?", bind: [id] });
      this.db.exec({ sql: "INSERT INTO busqueda (id, titulo, texto) VALUES (?, ?, ?)", bind: [id, titulo ?? id, texto] });
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  contar(): number {
    return this.db.selectValue("SELECT count(*) FROM documentos") as number;
  }

  cerrar(): void { this.db.close(); }
}
