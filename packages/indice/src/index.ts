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
  /** Código único del documento (DV-000123). */
  codigo?: string;
  /** SHA-256 de los bytes del archivo, para encontrar copias exactas. */
  hash?: string;
  /** Fecha de vencimiento (AAAA-MM-DD) y cómo se obtuvo. */
  vence?: string | null;
  venceEstado?: EstadoVence | null;
  /** La fecha tal como aparece en el documento. */
  venceTexto?: string | null;
  /** La otra forma de leer una fecha ambigua (03/04 puede ser 3 de abril o 4 de marzo). */
  venceOtra?: string | null;
}

/** Ver packages/core/src/vencimientos.ts. */
export type EstadoVence = "detectada" | "por confirmar" | "no detectada" | "confirmada" | "manual" | "sin vencimiento";
const DECIDIDO = "('confirmada', 'manual', 'sin vencimiento')";

/** Cómo se obtuvo el texto del documento. */
export type EstadoTexto = "listo" | "sin texto" | "pendiente de OCR" | "formato no soportado" | "error";

export interface FichaDocumento {
  id: string; titulo: string; carpeta: string | null; ruta: string | null; tamano: number | null;
  modificado: number | null; tipo: string | null; estadoTexto: EstadoTexto | null; confianza: number | null; codigo: string | null;
  hash: string | null; vence: string | null; venceEstado: EstadoVence | null; venceTexto: string | null; venceOtra: string | null;
}

const COLUMNAS = `id, titulo, carpeta, ruta, tamano, modificado, tipo, estado_texto AS estadoTexto, confianza, codigo,
  hash, vence, vence_estado AS venceEstado, vence_texto AS venceTexto, vence_otra AS venceOtra`;

/** `fragmento` marca las palabras halladas entre los caracteres \u0002 y \u0003. */
export interface Hallazgo { id: string; titulo: string; fragmento: string; puntaje: number }

const VERSION_ESQUEMA = 5;

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
    DROP TABLE IF EXISTS ajustes;
    CREATE TABLE documentos (
      id TEXT PRIMARY KEY, titulo TEXT, carpeta TEXT, ruta TEXT,
      tamano INTEGER, modificado INTEGER, tipo TEXT, estado_texto TEXT, confianza REAL, codigo TEXT,
      hash TEXT, vence TEXT, vence_estado TEXT, vence_texto TEXT, vence_otra TEXT
    );
    CREATE UNIQUE INDEX documentos_codigo ON documentos(codigo);
    CREATE TABLE ajustes (clave TEXT PRIMARY KEY, valor TEXT);
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
        let version = db.selectValue("PRAGMA user_version") as number;
        // Índices de entregas anteriores: se actualizan sin volver a leer la carpeta.
        if (version === 2) { db.exec("ALTER TABLE documentos ADD COLUMN confianza REAL"); version = 3; }
        if (version === 3) {
          db.exec(`ALTER TABLE documentos ADD COLUMN codigo TEXT;
                   CREATE UNIQUE INDEX documentos_codigo ON documentos(codigo);
                   CREATE TABLE ajustes (clave TEXT PRIMARY KEY, valor TEXT);`);
          version = 4;
        }
        if (version === 4) {
          db.exec(`ALTER TABLE documentos ADD COLUMN hash TEXT;
                   ALTER TABLE documentos ADD COLUMN vence TEXT;
                   ALTER TABLE documentos ADD COLUMN vence_estado TEXT;
                   ALTER TABLE documentos ADD COLUMN vence_texto TEXT;
                   ALTER TABLE documentos ADD COLUMN vence_otra TEXT;`);
          version = 5;
        }
        if (version === VERSION_ESQUEMA) {
          db.exec(`PRAGMA user_version = ${VERSION_ESQUEMA}`);
          return new Indice(sqlite3, db);
        }
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

  /**
   * Agrega o reemplaza documentos (por id). Conserva el código que ya tenía y,
   * si el usuario ya decidió la fecha de vencimiento, también esa decisión.
   */
  agregar(docs: DocIndice[]): void {
    this.db.exec("BEGIN");
    try {
      for (const d of docs) {
        const previo = this.porId(d.id);
        const decidido = previo?.venceEstado && ["confirmada", "manual", "sin vencimiento"].includes(previo.venceEstado);
        const v = decidido
          ? { vence: previo.vence, venceEstado: previo.venceEstado, venceTexto: previo.venceTexto, venceOtra: previo.venceOtra }
          : { vence: d.vence ?? null, venceEstado: d.venceEstado ?? null, venceTexto: d.venceTexto ?? null, venceOtra: d.venceOtra ?? null };
        this.db.exec({
          sql: `INSERT OR REPLACE INTO documentos (id, titulo, carpeta, ruta, tamano, modificado, tipo, estado_texto, confianza, codigo,
                  hash, vence, vence_estado, vence_texto, vence_otra)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          bind: [d.id, d.titulo, d.carpeta ?? null, d.ruta ?? null, d.tamano ?? null, d.modificado ?? null, d.tipo ?? null, d.estadoTexto ?? null,
            d.confianza ?? null, d.codigo ?? previo?.codigo ?? null, d.hash ?? null, v.vence, v.venceEstado, v.venceTexto, v.venceOtra],
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
      sql: `SELECT ${COLUMNAS} FROM documentos ORDER BY coalesce(ruta, id)`,
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

  /** El documento con ese código (DV-000123), o null. */
  porCodigo(codigo: string): FichaDocumento | null {
    let f: FichaDocumento | null = null;
    this.db.exec({
      sql: `SELECT ${COLUMNAS} FROM documentos WHERE codigo = ?`,
      bind: [codigo], rowMode: "object", callback: (x: FichaDocumento) => { f = { ...x }; },
    });
    return f;
  }

  /** El documento con ese id, o null. */
  porId(id: string): FichaDocumento | null {
    let f: FichaDocumento | null = null;
    this.db.exec({
      sql: `SELECT ${COLUMNAS} FROM documentos WHERE id = ?`,
      bind: [id], rowMode: "object", callback: (x: FichaDocumento) => { f = { ...x }; },
    });
    return f;
  }

  /**
   * Pone la fecha de vencimiento de un documento. Si `delUsuario` es falso (la app la
   * detectó), no reemplaza una fecha que el usuario ya confirmó o corrigió.
   */
  ponerVencimiento(
    id: string,
    v: { vence: string | null; venceEstado: EstadoVence; venceTexto?: string | null; venceOtra?: string | null },
    delUsuario = false,
  ): void {
    this.db.exec({
      sql: `UPDATE documentos SET vence = ?, vence_estado = ?, vence_texto = ?, vence_otra = ?
            WHERE id = ? ${delUsuario ? "" : `AND coalesce(vence_estado, '') NOT IN ${DECIDIDO}`}`,
      bind: [v.vence, v.venceEstado, v.venceTexto ?? null, v.venceOtra ?? null, id],
    });
  }

  ponerHash(id: string, hash: string): void {
    this.db.exec({ sql: "UPDATE documentos SET hash = ? WHERE id = ?", bind: [hash, id] });
  }

  /** Id, hash y texto de todos los documentos, para buscar duplicados. */
  paraComparar(): { id: string; hash: string | null; texto: string }[] {
    const filas: { id: string; hash: string | null; texto: string }[] = [];
    this.db.exec({
      sql: "SELECT d.id AS id, d.hash AS hash, coalesce(b.texto, '') AS texto FROM documentos d LEFT JOIN busqueda b ON b.id = d.id",
      rowMode: "object", callback: (f: { id: string; hash: string | null; texto: string }) => { filas.push({ ...f }); },
    });
    return filas;
  }

  /** Pone o cambia el código de documentos ya indexados. */
  ponerCodigos(codigos: Map<string, string>): void {
    this.db.exec("BEGIN");
    try {
      for (const [id, codigo] of codigos) this.db.exec({ sql: "UPDATE documentos SET codigo = ? WHERE id = ?", bind: [codigo, id] });
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  ajuste(clave: string): string | null {
    return (this.db.selectValue("SELECT valor FROM ajustes WHERE clave = ?", [clave]) as string | undefined) ?? null;
  }

  ponerAjuste(clave: string, valor: string): void {
    this.db.exec({ sql: "INSERT OR REPLACE INTO ajustes VALUES (?, ?)", bind: [clave, valor] });
  }

  contar(): number {
    return this.db.selectValue("SELECT count(*) FROM documentos") as number;
  }

  cerrar(): void { this.db.close(); }
}
