/** Las carpetas como tarjetas, y el formulario para crear una o cambiar su descripción. */
import { useState, type CSSProperties } from "react";
import { cambiarDescripcion, crearCarpeta, nombreValido, pedirEscritura, type Carpeta } from "./carpeta";

export const EJEMPLO_DESCRIPCION = "facturas, recibos y comprobantes de compra o pago";
/** La "carpeta" de los documentos que están sueltos en la carpeta principal. */
export const SIN_CARPETA = "";

const TONOS = ["#0E5E66", "#3A5BA0", "#8A5100", "#6B4FA0", "#2F7A3E", "#A0402F", "#4A6272", "#8A3A6E"];
export function tonoDe(nombre: string): string {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONOS[h % TONOS.length]!;
}

export interface ResumenCarpeta extends Carpeta { documentos: number; existe: boolean }

interface Props {
  raiz: FileSystemDirectoryHandle;
  carpetas: ResumenCarpeta[];
  abierta: string | null;
  alAbrir: (nombre: string | null) => void;
  alCambiar: () => void;
}

export function Carpetas({ raiz, carpetas, abierta, alAbrir, alCambiar }: Props) {
  const [editando, setEditando] = useState<Carpeta | "nueva" | null>(null);
  return (
    <section className="carpetas" aria-label="Carpetas">
      <div className="seccion-titulo">
        <h2>Carpetas</h2>
        <span className="nota">{carpetas.filter((c) => c.existe).length} carpetas · elige una para ver sus documentos</span>
      </div>
      <ul className="grilla-carpetas">
        {carpetas.map((c) => {
          const activa = abierta === c.nombre;
          const nombre = c.nombre || "Sin carpeta";
          return (
            <li key={c.nombre || "·"} className={`tarjeta-carpeta${activa ? " activa" : ""}`} style={{ "--tono": tonoDe(nombre) } as CSSProperties}>
              <button className="abrir-carpeta" onClick={() => alAbrir(activa ? null : c.nombre)} aria-pressed={activa} aria-label={`Carpeta ${nombre}`}>
                <span className="pestana" aria-hidden="true" />
                <b className="nombre-carpeta">{nombre}</b>
                <span className="cuenta-carpeta">{c.documentos} {c.documentos === 1 ? "documento" : "documentos"}</span>
                {c.existe
                  ? <span className={`desc${c.descripcion ? "" : " falta"}`}>{c.descripcion || "Sin descripción: agrégala para mejores sugerencias"}</span>
                  : <span className="desc">Archivos sueltos en la carpeta principal</span>}
              </button>
              {c.existe && (
                <button className="editar" onClick={() => setEditando(c)} aria-label={`Editar ${c.nombre}`} title="Editar descripción">✎</button>
              )}
            </li>
          );
        })}
        <li className="tarjeta-carpeta nueva">
          <button className="abrir-carpeta" onClick={() => setEditando("nueva")}>
            <span className="mas" aria-hidden="true">+</span>
            <b className="nombre-carpeta">Nueva carpeta</b>
            <span className="desc">Con una descripción, la app sugiere dónde guardar cada archivo</span>
          </button>
        </li>
      </ul>
      {editando && (
        <FormCarpeta
          raiz={raiz}
          carpeta={editando === "nueva" ? null : editando}
          existentes={carpetas.map((c) => c.nombre.toLowerCase())}
          alTerminar={(cambio) => { setEditando(null); if (cambio) alCambiar(); }}
        />
      )}
    </section>
  );
}

export function FormCarpeta({ raiz, carpeta, existentes, alTerminar }: {
  raiz: FileSystemDirectoryHandle; carpeta: Carpeta | null; existentes: string[];
  alTerminar: (cambio: string | null) => void;
}) {
  const [nombre, setNombre] = useState(carpeta?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(carpeta?.descripcion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const problema = carpeta ? null : nombreValido(nombre)
      ?? (existentes.includes(nombre.trim().toLowerCase()) ? "Ya hay una carpeta con ese nombre." : null);
    if (problema) { setError(problema); return; }
    if (!descripcion.trim()) { setError("Escribe una descripción corta: con ella la app acierta mucho más."); return; }
    setGuardando(true);
    try {
      // El permiso se pide aquí, con el clic, porque Chrome lo exige así.
      if (!(await pedirEscritura(raiz))) { setError("Sin permiso para escribir en la carpeta no puedo crearla."); return; }
      if (carpeta) await cambiarDescripcion(raiz, carpeta.nombre, descripcion);
      else await crearCarpeta(raiz, nombre, descripcion);
      alTerminar(carpeta?.nombre ?? nombre.trim());
    } catch (e) {
      setError(`No se pudo guardar: ${String(e)}`);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="panel" role="dialog" aria-label={carpeta ? "Editar carpeta" : "Nueva carpeta"}>
      <h3>{carpeta ? `Carpeta «${carpeta.nombre}»` : "Nueva carpeta"}</h3>
      {!carpeta && (
        <label>Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Facturas" autoFocus />
        </label>
      )}
      <label>¿Qué va en esta carpeta?
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={EJEMPLO_DESCRIPCION} autoFocus={!!carpeta} />
      </label>
      <p className="nota">Ejemplo para «Facturas»: {EJEMPLO_DESCRIPCION}.</p>
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        <button className="primario" onClick={guardar} disabled={guardando}>{carpeta ? "Guardar" : "Crear carpeta"}</button>
        <button onClick={() => alTerminar(null)} disabled={guardando}>Cancelar</button>
      </div>
    </div>
  );
}
