/** La ficha de un documento: sus datos, su código con QR y código de barras, y sus acciones. */
import { useEffect, useRef, useState } from "react";
import type { FichaDocumento } from "@docvault/indice";
import { BarrasSvg, QrSvg } from "./Codigo";
import { dudoso, ESTADOS, fecha, nombreDe, tamano } from "./Documentos";
import { Miniatura } from "./Miniatura";

interface Props {
  raiz: FileSystemDirectoryHandle;
  doc: FichaDocumento;
  texto: () => string;
  alAbrir: () => void;
  alCerrar: () => void;
}

export function Ficha({ raiz, doc, texto, alAbrir, alCerrar }: Props) {
  const [verTexto, setVerTexto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => { setVerTexto(false); setCopiado(false); panel.current?.focus(); }, [doc.id]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") alCerrar(); };
    addEventListener("keydown", tecla);
    return () => removeEventListener("keydown", tecla);
  }, [alCerrar]);

  const copiar = async () => {
    if (!doc.codigo) return;
    try { await navigator.clipboard.writeText(doc.codigo); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
    catch { /* sin permiso para el portapapeles: el código se ve igual */ }
  };

  return (
    <>
      <div className="velo" onClick={alCerrar} aria-hidden="true" />
      <aside ref={panel} className="ficha" role="dialog" aria-modal="true" aria-label="Ficha del documento" tabIndex={-1}>
        <div className="ficha-cabeza">
          <span className="sobre">{doc.carpeta || "Carpeta principal"}</span>
          <button className="cerrar" onClick={alCerrar} aria-label="Cerrar la ficha">×</button>
        </div>
        <Miniatura raiz={raiz} doc={doc} />
        <h2 className="ficha-nombre">{nombreDe(doc.id)}</h2>
        <dl className="datos">
          <dt>Tipo</dt><dd>{(doc.tipo || "sin extensión").toUpperCase()} · {tamano(doc.tamano)}</dd>
          <dt>Modificado</dt><dd>{fecha(doc.modificado)}</dd>
          <dt>Texto</dt>
          <dd>
            {ESTADOS[doc.estadoTexto ?? "error"]}
            {doc.confianza != null && ` · OCR ${Math.round(doc.confianza * 100)} %`}
            {dudoso(doc) && <span className="revisar"> · Revisar lectura</span>}
          </dd>
          <dt>Ruta</dt><dd className="ruta">{doc.id}</dd>
        </dl>

        {doc.codigo ? (
          <section className="codigos" aria-label="Código del documento">
            <QrSvg texto={doc.codigo} tamano={104} />
            <div className="codigos-texto">
              <span className="codigo-grande">{doc.codigo}</span>
              <BarrasSvg texto={doc.codigo} />
              <span className="nota">Escribe o escanea este código en el buscador para volver a este documento.</span>
            </div>
          </section>
        ) : <p className="nota">Este documento recibe su código al terminar de actualizar.</p>}

        <div className="acciones">
          <button className="primario" onClick={alAbrir}>Abrir documento</button>
          {doc.estadoTexto === "listo" && (
            <button onClick={() => setVerTexto(!verTexto)} aria-expanded={verTexto}>{verTexto ? "Ocultar texto" : "Ver texto"}</button>
          )}
          {doc.codigo && <button onClick={copiar}>{copiado ? "Copiado ✓" : "Copiar código"}</button>}
        </div>
        {verTexto && (
          <div className="texto">
            {doc.confianza != null && (
              <p className="nota">Leído con OCR · confianza {Math.round(doc.confianza * 100)} %{dudoso(doc) ? " · compáralo con el original antes de usarlo" : ""}</p>
            )}
            <pre>{texto()}</pre>
          </div>
        )}
        <p className="nota pie-ficha">Imprimir o descargar con el código estampado llega en la entrega 5.</p>
      </aside>
    </>
  );
}
