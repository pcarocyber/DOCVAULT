/**
 * Comparar dos documentos lado a lado y decidir si son duplicados.
 * - En la bóveda: quitar uno de los dos (va a la papelera), decir que no son
 *   duplicados, o dejarlo así.
 * - Al subir: agregar el nuevo como sea, dejarlo así (no agregarlo), o
 *   agregarlo y quitar el que ya estaba.
 */
import { useEffect, useRef, useState } from "react";
import type { FichaDocumento } from "@docvault/indice";
import type { Par } from "@docvault/core";
import { archivoPorRuta } from "./carpeta";
import { explicarPar, etiquetaPar } from "./Alertas";
import { fecha, nombreDe, tamano } from "./Documentos";
import { Previa } from "./Miniatura";

/** Un lado de la comparación: un documento de la bóveda o un archivo que se está subiendo. */
export type Lado =
  | { tipo: "boveda"; doc: FichaDocumento; texto: string }
  | { tipo: "nuevo"; archivo: File; texto: string };

export type DecisionBoveda = { quitar: string } | "no son" | "dejar";
export type DecisionSubida = "agregar" | "no agregar" | "reemplazar";

type Props =
  | { modo: "boveda"; raiz: FileSystemDirectoryHandle; par: Pick<Par, "tipo" | "similitud">; a: Lado; b: Lado; alDecidir: (d: DecisionBoveda) => Promise<void>; alCerrar: () => void }
  | { modo: "subida"; raiz: FileSystemDirectoryHandle; par: Pick<Par, "tipo" | "similitud">; a: Lado; b: Lado; alDecidir: (d: DecisionSubida) => Promise<void>; alCerrar: () => void };

const ext = (n: string) => { const i = n.lastIndexOf("."); return i > 0 ? n.slice(i + 1).toLowerCase() : ""; };

export function Comparar(props: Props) {
  const { raiz, par, a, b, alCerrar } = props;
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    caja.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape" && !ocupado) alCerrar(); };
    addEventListener("keydown", tecla);
    return () => removeEventListener("keydown", tecla);
  }, [alCerrar, ocupado]);

  const decidir = async (d: DecisionBoveda | DecisionSubida) => {
    setOcupado(true);
    setError(null);
    try {
      // El tipo de `d` siempre corresponde al modo: cada botón se dibuja solo en su modo.
      await (props.alDecidir as (x: typeof d) => Promise<void>)(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const columna = (l: Lado, titulo: string) => {
    const nombre = l.tipo === "boveda" ? nombreDe(l.doc.id) : l.archivo.name;
    const tipo = l.tipo === "boveda" ? l.doc.tipo ?? "" : ext(l.archivo.name);
    const obtener = l.tipo === "boveda" ? () => archivoPorRuta(raiz, l.doc.id) : async () => l.archivo;
    const clave = l.tipo === "boveda" ? `${l.doc.id}|${l.doc.modificado}` : `nuevo|${l.archivo.name}|${l.archivo.size}`;
    return (
      <div className="lado" aria-label={`${titulo}: ${nombre}`}>
        <p className="sobre">{titulo}</p>
        <Previa obtener={obtener} tipo={tipo} clave={clave} />
        <h3 title={nombre}>{nombre}</h3>
        <p className="nota">
          {l.tipo === "boveda" ? <>{l.doc.codigo ?? ""}{l.doc.carpeta ? ` · ${l.doc.carpeta}` : " · Carpeta principal"} · {tamano(l.doc.tamano)} · {fecha(l.doc.modificado)}</>
            : <>Nuevo · {tamano(l.archivo.size)} · {fecha(l.archivo.lastModified)}</>}
        </p>
        {props.modo === "boveda" && l.tipo === "boveda" && (
          <button className="peligro" disabled={ocupado} onClick={() => decidir({ quitar: l.doc.id })}>Sí, quitar este</button>
        )}
        <pre className="extracto">{l.texto.trim().slice(0, 1200) || "Sin texto leído."}</pre>
      </div>
    );
  };

  return (
    <>
      <div className="velo" onClick={() => !ocupado && alCerrar()} aria-hidden="true" />
      <div ref={caja} className="comparar" role="dialog" aria-modal="true" aria-label="Comparar documentos" tabIndex={-1}>
        <div className="comparar-cabeza">
          <div>
            <span className={`chip-dup ${par.tipo === "parecido" ? "parecido" : ""}`}>{etiquetaPar(par)}</span>
            <h2>¿Son duplicados?</h2>
            <p className="nota">{explicarPar(par)}</p>
          </div>
          <button className="cerrar" onClick={alCerrar} disabled={ocupado} aria-label="Cerrar la comparación">×</button>
        </div>
        <div className="lados">
          {columna(a, props.modo === "subida" ? "El que estás subiendo" : "Documento 1")}
          {columna(b, props.modo === "subida" ? "El que ya está en tu bóveda" : "Documento 2")}
        </div>
        {props.modo === "boveda" ? (
          <div className="comparar-pie">
            <p className="nota">Si quitas uno, va a la papelera de DOCVAULT y lo puedes recuperar.</p>
            <div className="acciones">
              <button disabled={ocupado} onClick={() => decidir("no son")}>No son duplicados</button>
              <button disabled={ocupado} onClick={() => decidir("dejar")}>Dejarlo así</button>
            </div>
          </div>
        ) : (
          <div className="comparar-pie">
            <p>¿Quieres agregarlo como sea o dejarlo así?</p>
            <div className="acciones">
              <button className="primario" disabled={ocupado} onClick={() => decidir("no agregar")}>Dejarlo así (no agregarlo)</button>
              <button disabled={ocupado} onClick={() => decidir("agregar")}>Agregarlo como sea</button>
              {b.tipo === "boveda" && <button className="peligro" disabled={ocupado} onClick={() => decidir("reemplazar")}>Agregarlo y quitar el que ya está</button>}
            </div>
            {b.tipo === "boveda" && <p className="nota">El que quites va a la papelera de DOCVAULT y lo puedes recuperar.</p>}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
