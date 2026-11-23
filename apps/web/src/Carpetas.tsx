/** Lista de carpetas con su descripción, y el formulario para crear o editar una. */
import { useState } from "react";
import { cambiarDescripcion, crearCarpeta, nombreValido, pedirEscritura, type Carpeta } from "./carpeta";

export const EJEMPLO_DESCRIPCION = "facturas, recibos y comprobantes de compra o pago";

interface Props {
  raiz: FileSystemDirectoryHandle;
  carpetas: Carpeta[];
  alCambiar: () => void;
}

export function Carpetas({ raiz, carpetas, alCambiar }: Props) {
  const [editando, setEditando] = useState<Carpeta | "nueva" | null>(null);
  return (
    <section className="carpetas" aria-label="Carpetas">
      <div className="carpetas-titulo">
        <h2>Carpetas</h2>
        <button onClick={() => setEditando("nueva")}>Nueva carpeta</button>
      </div>
      {carpetas.length === 0 && <p className="nota">Todavía no hay carpetas. Crea una para que la app pueda sugerir dónde guardar cada documento.</p>}
      <ul className="chips">
        {carpetas.map((c) => (
          <li key={c.nombre}>
            <button className="chip" onClick={() => setEditando(c)} title="Editar descripción">
              <b>{c.nombre}</b>
              <span className={c.descripcion ? "" : "falta"}>{c.descripcion || "sin descripción: agrégala para mejores sugerencias"}</span>
            </button>
          </li>
        ))}
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
