/** La ficha de un documento: sus datos, su código con QR y código de barras, y sus acciones. */
import { useEffect, useRef, useState } from "react";
import type { EstadoVence, FichaDocumento } from "@docvault/indice";
import { cuandoVence, fechaLarga, fechaValida, hoyIso } from "@docvault/core";
import { BarrasSvg, QrSvg } from "./Codigo";
import { claseEtapa, dudoso, ESTADOS, fecha, nombreDe, tamano } from "./Documentos";
import { Miniatura } from "./Miniatura";
import { archivoPorRuta } from "./carpeta";
import { abrirParaImprimir, descargar, estampar, etiqueta, imprimirAqui, nombreConCodigo, nombreSeguro, sePuedeEstampar } from "./estampar";

interface Props {
  raiz: FileSystemDirectoryHandle;
  doc: FichaDocumento;
  texto: () => string;
  alAbrir: () => void;
  alCerrar: () => void;
  alCambiarVence: (vence: string | null, estado: EstadoVence) => Promise<void>;
}

export function Ficha({ raiz, doc, texto, alAbrir, alCerrar, alCambiarVence }: Props) {
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

        <Vence doc={doc} alCambiar={alCambiarVence} />

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
        {doc.codigo && <Imprimir raiz={raiz} doc={doc} />}

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
      </aside>
    </>
  );
}

/** La fecha de vencimiento: verla, confirmarla, corregirla o decir que no vence. */
function Vence({ doc, alCambiar }: { doc: FichaDocumento; alCambiar: Props["alCambiarVence"] }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(doc.vence ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setEditando(false); setValor(doc.vence ?? ""); setError(null); }, [doc.id, doc.vence]);

  const hoy = hoyIso();
  const cambiar = async (vence: string | null, estado: EstadoVence) => {
    setGuardando(true);
    setError(null);
    try { await alCambiar(vence, estado); setEditando(false); }
    catch (e) { setError(`No se pudo guardar: ${String(e)}`); }
    finally { setGuardando(false); }
  };
  const guardarManual = () => {
    if (!fechaValida(valor)) { setError("Escribe una fecha completa."); return; }
    void cambiar(valor, doc.vence === valor && doc.venceEstado !== "manual" ? "confirmada" : "manual");
  };

  const e = doc.venceEstado;
  let estadoTexto = "";
  if (e === "detectada") estadoTexto = "Leída en el documento";
  if (e === "confirmada") estadoTexto = "Confirmada por ti";
  if (e === "manual") estadoTexto = "Escrita por ti";

  return (
    <section className="vence" aria-label="Vencimiento">
      <div className="vence-cabeza">
        <h3>Vencimiento</h3>
        {doc.vence && e !== "sin vencimiento" && <span className={`chip-vence ${claseEtapa(doc.vence, hoy)}`}>{cuandoVence(doc.vence, hoy)}</span>}
      </div>

      {editando ? (
        <div className="vence-editar">
          <label>Fecha de vencimiento
            <input type="date" value={valor} onChange={(ev) => setValor(ev.target.value)} autoFocus />
          </label>
          <div className="acciones">
            <button className="primario" onClick={guardarManual} disabled={guardando}>Guardar fecha</button>
            <button onClick={() => cambiar(null, "sin vencimiento")} disabled={guardando}>No vence</button>
            <button onClick={() => { setEditando(false); setError(null); }} disabled={guardando}>Cancelar</button>
          </div>
        </div>
      ) : e === "por confirmar" && doc.vence && doc.venceOtra ? (
        <div className="vence-pregunta">
          <p>El documento dice <b>«{doc.venceTexto}»</b>. ¿Qué fecha es?</p>
          <div className="acciones">
            <button className="primario" onClick={() => cambiar(doc.vence, "confirmada")} disabled={guardando}>{fechaLarga(doc.vence)}</button>
            <button className="primario" onClick={() => cambiar(doc.venceOtra, "confirmada")} disabled={guardando}>{fechaLarga(doc.venceOtra!)}</button>
            <button onClick={() => setEditando(true)} disabled={guardando}>Otra fecha</button>
          </div>
        </div>
      ) : e === "sin vencimiento" ? (
        <div>
          <p className="vence-fecha">No vence <span className="nota">· lo indicaste tú</span></p>
          <button className="enlace" onClick={() => setEditando(true)}>Poner una fecha</button>
        </div>
      ) : doc.vence ? (
        <div>
          <p className="vence-fecha">{fechaLarga(doc.vence)} <span className="nota">· {estadoTexto}</span></p>
          {e === "detectada" && doc.venceTexto && <p className="nota">Lo leí de «{doc.venceTexto}». Confírmalo o corrígelo si no es la fecha de vencimiento.</p>}
          <div className="acciones">
            {e === "detectada" && <button onClick={() => cambiar(doc.vence, "confirmada")} disabled={guardando}>Es correcta</button>}
            <button onClick={() => setEditando(true)} disabled={guardando}>Cambiar</button>
            <button onClick={() => cambiar(null, "sin vencimiento")} disabled={guardando}>No vence</button>
          </div>
        </div>
      ) : (
        <div>
          <p className="nota">{doc.estadoTexto === "pendiente de OCR" ? "Se buscará la fecha cuando termine de leer el texto." : "No encontré fecha de vencimiento en el texto."}</p>
          <button onClick={() => setEditando(true)}>Poner fecha de vencimiento</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

/** Descargar o imprimir el documento con su código, o solo la etiqueta. */
function Imprimir({ raiz, doc }: { raiz: FileSystemDirectoryHandle; doc: FichaDocumento }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { setAviso(null); }, [doc.id]);
  const codigo = doc.codigo!;
  const nombre = nombreDe(doc.id);
  const hacer = async (que: string, f: () => Promise<void>) => {
    setOcupado(que); setAviso(null);
    try { await f(); }
    catch (e) { setAviso(`No se pudo preparar el PDF: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setOcupado(null); }
  };
  const conCodigo = async () => estampar(await archivoPorRuta(raiz, doc.id), doc.tipo ?? "", codigo);
  const puede = sePuedeEstampar(doc.tipo);
  /** Abre el cuadro de imprimir de Chrome; si no se puede aquí, en una pestaña nueva. */
  const imprimirPdf = async (bytes: Uint8Array, listo: string) => {
    try { await imprimirAqui(bytes); setAviso(listo); }
    catch {
      if (abrirParaImprimir(bytes)) setAviso("Se abrió en una pestaña nueva: imprime desde ahí con Cmd + P.");
      else setAviso("Chrome bloqueó la ventana nueva. Permite las ventanas emergentes de esta página o usa «Descargar con código».");
    }
  };
  const imprimirConCodigo = () => hacer("imprimir", async () => imprimirPdf(await conCodigo(), "Listo: en el cuadro de imprimir verás la franja con el código al pie de la primera página."));
  const imprimirEtiqueta = () => hacer("etiqueta", async () => imprimirPdf(await etiqueta(codigo, nombre), "Listo: la etiqueta mide 7 × 3 cm. Imprímela en tamaño real (100 %)."));
  // Cmd + P (Ctrl + P) con la ficha abierta imprime el documento con su código, no la pantalla.
  const atajo = useRef<() => void>(() => {});
  atajo.current = puede ? imprimirConCodigo : imprimirEtiqueta;
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") { e.preventDefault(); atajo.current(); }
    };
    addEventListener("keydown", tecla);
    return () => removeEventListener("keydown", tecla);
  }, []);
  return (
    <section className="imprimir" aria-label="Imprimir con código">
      <h3>Imprimir con código</h3>
      {puede
        ? <p className="nota">Al imprimir desde DOCVAULT, la primera página sale con una franja al pie: QR, código de barras y {codigo}. También al pulsar «Abrir documento» o Cmd + P aquí. Tu archivo original no cambia.</p>
        : <p className="nota">A los archivos {(doc.tipo || "sin extensión").toUpperCase()} no les puedo poner la franja. Imprime la etiqueta y pégala en el papel, o guárdalo como PDF y súbelo.</p>}
      <div className="acciones">
        {puede && <button disabled={!!ocupado} onClick={imprimirConCodigo}>{ocupado === "imprimir" ? "Preparando…" : "Imprimir con código"}</button>}
        {puede && <button disabled={!!ocupado} onClick={() => hacer("descargar", async () => descargar(await conCodigo(), nombreConCodigo(nombre, codigo)))}>{ocupado === "descargar" ? "Preparando…" : "Descargar con código"}</button>}
        <button disabled={!!ocupado} onClick={imprimirEtiqueta}>{ocupado === "etiqueta" ? "Preparando…" : "Imprimir etiqueta"}</button>
      </div>
      {aviso && <p className="nota" role="status">{aviso}</p>}
    </section>
  );
}
