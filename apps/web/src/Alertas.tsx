/**
 * "Para revisar" en la portada: documentos vencidos o por vencer, fechas que hay
 * que confirmar y posibles duplicados dentro de la bóveda.
 */
import { useState } from "react";
import type { FichaDocumento } from "@docvault/indice";
import { cuandoVence, fechaCorta, hoyIso, type Par } from "@docvault/core";
import { activarAvisos, permisoAvisos, porVencer, type PermisoAvisos } from "./avisos";
import { claseEtapa, nombreDe } from "./Documentos";

interface Props {
  docs: FichaDocumento[];
  porId: Map<string, FichaDocumento>;
  duplicados: Par[];
  alElegir: (id: string) => void;
  alIgnorar: (p: Par) => void;
  alComparar: (p: Par) => void;
  papelera: number;
  alVerPapelera: () => void;
  alActivarAvisos: () => void;
}

const MAX = 6;

export function Alertas({ docs, porId, duplicados, alElegir, alIgnorar, alComparar, papelera, alVerPapelera, alActivarAvisos }: Props) {
  const hoy = hoyIso();
  const [todos, setTodos] = useState(false);
  const [todosDup, setTodosDup] = useState(false);
  const [permiso, setPermiso] = useState<PermisoAvisos>(permisoAvisos);
  const proximos = porVencer(docs, hoy);
  const porConfirmar = docs.filter((d) => d.venceEstado === "por confirmar");
  const conFecha = docs.filter((d) => d.vence && d.venceEstado !== "sin vencimiento").sort((a, b) => a.vence!.localeCompare(b.vence!));
  const masAdelante = conFecha.length - proximos.length;
  const lista = todos ? conFecha : proximos;

  const activar = async () => { setPermiso(await activarAvisos()); alActivarAvisos(); };

  return (
    <section className="alertas" aria-label="Para revisar">
      <div className="alerta" aria-label="Vencimientos">
        <div className="alerta-cabeza">
          <h2>Vencimientos</h2>
          {permiso === "sin decidir" && <button onClick={activar}>Activar avisos</button>}
          {permiso === "activos" && <span className="nota">Avisos activos</span>}
          {permiso === "bloqueados" && <span className="nota" title="Se cambian en el candado de la barra de direcciones de Chrome">Avisos bloqueados en Chrome</span>}
        </div>
        {lista.length === 0
          ? <p className="nota">{conFecha.length === 0 ? "Ningún documento tiene fecha de vencimiento todavía." : "Nada vence en los próximos 30 días."}</p>
          : (
            <ul className="lista-alertas">
              {lista.slice(0, todos ? undefined : MAX).map((d) => (
                <li key={d.id}>
                  <button onClick={() => alElegir(d.id)} aria-label={`Ver ficha de ${nombreDe(d.id)}`}>
                    <span className={`chip-vence ${claseEtapa(d.vence!, hoy)}`}>{cuandoVence(d.vence!, hoy)}</span>
                    <span className="nombre">{nombreDe(d.id)}</span>
                    <span className="meta">{fechaCorta(d.vence!)}{d.codigo ? ` · ${d.codigo}` : ""}{d.venceEstado === "por confirmar" ? " · fecha por confirmar" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        {porConfirmar.length > 0 && (
          <div className="confirmar">
            <p><b>{porConfirmar.length === 1 ? "1 fecha por confirmar" : `${porConfirmar.length} fechas por confirmar`}</b>: se pueden leer de dos formas (como 03/04, que puede ser 3 de abril o 4 de marzo).</p>
            <ul className="lista-alertas">
              {porConfirmar.slice(0, MAX).map((d) => (
                <li key={d.id}>
                  <button onClick={() => alElegir(d.id)} aria-label={`Confirmar la fecha de ${nombreDe(d.id)}`}>
                    <span className="chip-vence confirmar">Confirmar</span>
                    <span className="nombre">{nombreDe(d.id)}</span>
                    <span className="meta">«{d.venceTexto}»{d.codigo ? ` · ${d.codigo}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {(masAdelante > 0 || todos) && (
          <button className="enlace" onClick={() => setTodos(!todos)}>
            {todos ? "Ver solo los próximos 30 días" : `Ver todas las fechas (${masAdelante} más adelante)`}
          </button>
        )}
      </div>

      <div className="alerta" aria-label="Duplicados">
        <div className="alerta-cabeza"><h2>Posibles duplicados</h2></div>
        {duplicados.length === 0
          ? <p className="nota">No encontré copias ni documentos muy parecidos.</p>
          : (
            <ul className="lista-dup">
              {duplicados.slice(0, todosDup ? undefined : MAX).map((p) => {
                const a = porId.get(p.a), b = porId.get(p.b);
                if (!a || !b) return null;
                return (
                  <li key={`${p.a}|${p.b}`}>
                    <span className={`chip-dup ${p.tipo === "parecido" ? "parecido" : ""}`}>{etiquetaPar(p)}</span>
                    <span className="par">
                      <button className="enlace" onClick={() => alElegir(a.id)}>{nombreDe(a.id)}</button>
                      {" y "}
                      <button className="enlace" onClick={() => alElegir(b.id)}>{nombreDe(b.id)}</button>
                    </span>
                    <span className="meta">{explicarPar(p)}</span>
                    <span className="botones-dup">
                      <button className="primario" onClick={() => alComparar(p)} aria-label={`Comparar ${nombreDe(a.id)} y ${nombreDe(b.id)}`}>Comparar</button>
                      <button className="ignorar" onClick={() => alIgnorar(p)}>No son duplicados</button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        {duplicados.length > MAX && (
          <button className="enlace" onClick={() => setTodosDup(!todosDup)}>{todosDup ? "Ver menos" : `Ver los ${duplicados.length}`}</button>
        )}
        {papelera > 0 && <button className="enlace papelera-enlace" onClick={alVerPapelera}>Papelera ({papelera})</button>}
      </div>
    </section>
  );
}

export function etiquetaPar(p: { tipo: Par["tipo"]; similitud: number }): string {
  return p.tipo === "exacto" ? "Copia exacta" : p.tipo === "casi idéntico" ? `Casi idénticos · ${Math.round(p.similitud * 100)} %` : `Parecidos · ${Math.round(p.similitud * 100)} %`;
}

export function explicarPar(p: { tipo: Par["tipo"] }): string {
  return p.tipo === "exacto" ? "El mismo archivo guardado dos veces."
    : p.tipo === "casi idéntico" ? "Casi el mismo texto: puede ser el mismo papel escaneado otra vez."
    : "Mucho texto en común: puede ser una versión nueva del mismo documento.";
}
