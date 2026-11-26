/** Panel de la papelera: recuperar un archivo quitado o borrarlo para siempre. */
import { useState } from "react";
import type { EnPapelera } from "./papelera";

interface Props {
  archivos: EnPapelera[];
  alRecuperar: (e: EnPapelera) => Promise<void>;
  alBorrar: (e: EnPapelera) => Promise<void>;
  alCerrar: () => void;
}

export function Papelera({ archivos, alRecuperar, alBorrar, alCerrar }: Props) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hacer = async (e: EnPapelera, f: (e: EnPapelera) => Promise<void>) => {
    setOcupado(e.guardadoComo); setError(null);
    try { await f(e); setConfirmar(null); } catch (x) { setError(x instanceof Error ? x.message : String(x)); } finally { setOcupado(null); }
  };
  return (
    <div className="panel papelera" role="dialog" aria-label="Papelera">
      <h3>Papelera</h3>
      <p className="nota">Lo que quitaste por duplicado. Sigue en tu carpeta, dentro de .docvault/papelera, hasta que lo borres para siempre.</p>
      {archivos.length === 0 ? <p className="nota">La papelera está vacía.</p> : (
        <ul className="subidas">
          {[...archivos].reverse().map((e) => (
            <li key={e.guardadoComo}>
              <span className="nombre">{e.ruta.split("/").at(-1)}</span>
              <span className="meta">{e.codigo ? `${e.codigo} · ` : ""}estaba en {e.ruta} · {new Date(e.quitado).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" })} · {e.motivo}</span>
              <span className="elegir acciones">
                <button onClick={() => hacer(e, alRecuperar)} disabled={!!ocupado}>Recuperar</button>
                {confirmar === e.guardadoComo
                  ? <button className="peligro" onClick={() => hacer(e, alBorrar)} disabled={!!ocupado}>Sí, borrar para siempre</button>
                  : <button onClick={() => setConfirmar(e.guardadoComo)} disabled={!!ocupado}>Borrar para siempre</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error">{error}</p>}
      <div className="acciones"><button onClick={alCerrar}>Cerrar</button></div>
    </div>
  );
}
