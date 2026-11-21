/**
 * Índice local: SQLite en WebAssembly con FTS5 (búsqueda por palabras).
 * En la fase 0 corre en memoria; en la fase 1 se guardará en OPFS.
 */
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

export interface DocIndice { id: string; titulo: string; texto: string; carpeta?: string }
export interface Hallazgo { id: string; titulo: string; fragmento: string; puntaje: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export class Indice {
  private constructor(private db: Db) {}

  static async abrir(): Promise<Indice> {
    const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
    const db = new sqlite3.oo1.DB(":memory:", "c");
    db.exec(`
      CREATE TABLE documentos (id TEXT PRIMARY KEY, titulo TEXT, carpeta TEXT);
      CREATE VIRTUAL TABLE busqueda USING fts5(
        id UNINDEXED, titulo, texto, tokenize = 'unicode61 remove_diacritics 2'
      );
    `);
    return new Indice(db);
  }

  agregar(docs: DocIndice[]): void {
    this.db.exec("BEGIN");
    try {
      for (const d of docs) {
        this.db.exec({ sql: "INSERT OR REPLACE INTO documentos VALUES (?, ?, ?)", bind: [d.id, d.titulo, d.carpeta ?? null] });
        this.db.exec({ sql: "INSERT INTO busqueda (id, titulo, texto) VALUES (?, ?, ?)", bind: [d.id, d.titulo, d.texto] });
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
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
      sql: `SELECT id, titulo, snippet(busqueda, 2, '[', ']', '…', 12) AS fragmento, bm25(busqueda) AS puntaje
            FROM busqueda WHERE busqueda MATCH ? ORDER BY puntaje LIMIT ?`,
      bind: [terminos.join(" "), limite],
      rowMode: "object",
      callback: (f: Hallazgo) => { filas.push({ ...f }); },
    });
    return filas;
  }

  contar(): number {
    return this.db.selectValue("SELECT count(*) FROM documentos") as number;
  }

  cerrar(): void { this.db.close(); }
}
