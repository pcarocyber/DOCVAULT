/**
 * Subir archivos: lee cada uno (con OCR si hace falta), sugiere la carpeta con
 * la IA básica, deja la sugerencia marcada, y guarda cuando el usuario confirma.
 * Nada se escribe en la carpeta hasta pulsar "Guardar".
 */
import { useEffect, useRef, useState } from "react";
import type { EstadoTexto, Indice } from "@docvault/indice";
import { compararConBoveda, cuandoVence, fechaCorta, hoyIso, UMBRALES_DUPLICADOS, type Coincidencia, type DatosVence, type DocComparable } from "@docvault/core";
import { etiquetaPar, explicarPar } from "./Alertas";
import { nombreDe } from "./Documentos";
import { MotorOcr } from "@docvault/core/navegador";
import { guardarArchivo, pedirEscritura, type Carpeta } from "./carpeta";
import { extension, fichaDe, hashDe, leerTexto, venceDe } from "./indexar";
import { leerConOcr } from "./ocr";
import { sugerirCarpeta } from "./sugerir";
import { Comparar, type DecisionSubida, type Lado } from "./Comparar";
import { moverAPapelera } from "./papelera";

/** "" es la carpeta principal (fuera de toda subcarpeta). */
const PRINCIPAL = "";

interface Subida {
  archivo: File;
  fase: "esperando" | "leyendo" | "sugiriendo" | "lista" | "guardada" | "error";
  texto: string;
  estado: EstadoTexto;
  confianza: number | null;
  orden: string[];          // carpetas, de la más sugerida a la menos
  sugerida: string | null;
  elegida: string;
  ruta?: string;
  aviso?: string;
  hash: string | null;
  vence: DatosVence | null;
  /** Documentos de la bóveda (o de esta misma subida) que se le parecen. */
  parecidos: Coincidencia[];
  /** Si se guarda al pulsar Guardar. Una copia exacta empieza sin marcar. */
  guardar: boolean;
  /** Documento de la bóveda que este reemplaza (va a la papelera al guardar). */
  reemplaza?: string;
  /** Lo que el usuario eligió al comparar, para mostrarlo. */
  decidido?: DecisionSubida;
}

interface Props {
  raiz: FileSystemDirectoryHandle;
  indice: Indice;
  carpetas: Carpeta[];
  archivos: File[];
  alGuardar: (rutas: string[]) => Promise<void>;
  alCerrar: () => void;
  alVer: (id: string) => void;
}

/** "nuevo:3" es el cuarto archivo de esta misma subida. */
const DE_ESTA_SUBIDA = "nuevo:";

export function Subir({ raiz, indice, carpetas, archivos, alGuardar, alCerrar, alVer }: Props) {
  const [subidas, setSubidas] = useState<Subida[]>(() => archivos.map((archivo) => ({
    archivo, fase: "esperando", texto: "", estado: "pendiente de OCR", confianza: null,
    orden: carpetas.map((c) => c.nombre), sugerida: null, elegida: PRINCIPAL,
    hash: null, vence: null, parecidos: [], guardar: true,
  })));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [avisoIa, setAvisoIa] = useState<string | null>(null);
  const [guardadoUnaVez, setGuardadoUnaVez] = useState(false);
  const [comparando, setComparando] = useState<number | null>(null);
  const cancelado = useRef(false);

  const cambiar = (i: number, cambio: Partial<Subida>) =>
    setSubidas((s) => s.map((x, j) => (j === i ? { ...x, ...cambio } : x)));

  // Leer y sugerir, uno por uno, en cuanto se abre el panel.
  useEffect(() => {
    cancelado.current = false;
    // Cada corrida tiene su propia marca: en modo desarrollo React monta el panel dos
    // veces, y sin esto quedarían dos lecturas en paralelo.
    const corrida = { parada: false };
    const parar = () => corrida.parada || cancelado.current;
    let motor: MotorOcr | null = null;
    const boveda: DocComparable[] = indice.paraComparar();
    const yaLeidos: DocComparable[] = [];
    (async () => {
      for (const [i, archivo] of archivos.entries()) {
        if (parar()) break;
        cambiar(i, { fase: "leyendo" });
        let { texto, estado } = await leerTexto(archivo);
        let confianza: number | null = null;
        if (estado === "pendiente de OCR") {
          try {
            motor ??= await MotorOcr.crear(["spa", "eng"]);
            ({ texto, estado, confianza } = await leerConOcr(motor, archivo, extension(archivo.name)));
          } catch {
            estado = "error";
          }
        }
        if (parar()) break;
        // ¿Ya está en la bóveda, o se parece mucho a algo que ya está?
        const hash = await hashDe(archivo);
        const comparable = { hash, texto: estado === "listo" ? texto : "" };
        const parecidos = [
          ...compararConBoveda(comparable, boveda, UMBRALES_DUPLICADOS),
          ...compararConBoveda(comparable, yaLeidos, UMBRALES_DUPLICADOS),
        ].sort((a, b) => b.similitud - a.similitud).slice(0, 3);
        yaLeidos.push({ id: `${DE_ESTA_SUBIDA}${i}`, ...comparable });
        cambiar(i, {
          fase: "sugiriendo", texto, estado, confianza, hash, parecidos,
          vence: venceDe(texto, estado), guardar: parecidos[0]?.tipo !== "exacto",
        });
        try {
          if (parar()) break;
          const s = await sugerirCarpeta(estado === "listo" ? texto : "", archivo.name, carpetas);
          const mejor = s[0]?.carpeta ?? null;
          cambiar(i, { fase: "lista", orden: s.map((x) => x.carpeta), sugerida: mejor, elegida: mejor ?? PRINCIPAL });
        } catch {
          setAvisoIa("No se pudo cargar la IA básica (¿sin internet la primera vez?). Elige la carpeta a mano.");
          cambiar(i, { fase: "lista" });
        }
      }
    })().finally(() => { void motor?.terminar(); });
    return () => { corrida.parada = true; };
    // Solo al abrir el panel con estos archivos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listas = subidas.filter((s) => s.fase === "lista" && s.guardar);
  const hoy = hoyIso();
  const nombreParecido = (id: string) => {
    if (id.startsWith(DE_ESTA_SUBIDA)) return { nombre: archivos[Number(id.slice(DE_ESTA_SUBIDA.length))]?.name ?? "", codigo: null, enBoveda: false };
    const d = indice.porId(id);
    return { nombre: nombreDe(id), codigo: d?.codigo ?? null, enBoveda: true };
  };
  const pendientes = subidas.filter((s) => s.fase === "esperando" || s.fase === "leyendo" || s.fase === "sugiriendo");

  const guardar = async () => {
    setError(null);
    setGuardando(true);
    try {
      if (!(await pedirEscritura(raiz))) { setError("Sin permiso para escribir en la carpeta no puedo guardar los archivos."); return; }
      const rutas: string[] = [];
      for (const [i, s] of subidas.entries()) {
        if (s.fase !== "lista" || !s.guardar) continue;
        try {
          if (s.reemplaza) await moverAPapelera(raiz, indice, s.reemplaza, `reemplazado por ${s.archivo.name}`);
          const { ruta, guardado } = await guardarArchivo(raiz, s.elegida, s.archivo);
          indice.agregar([fichaDe(ruta, guardado, s.texto, s.estado, s.confianza, null, s.hash, s.vence)]);
          rutas.push(ruta);
          cambiar(i, { fase: "guardada", ruta, aviso: ruta.split("/").at(-1) !== s.archivo.name ? "ya había uno con ese nombre" : undefined });
        } catch (e) {
          cambiar(i, { fase: "error", aviso: `no se pudo guardar: ${String(e)}` });
        }
      }
      await alGuardar(rutas);
      setGuardadoUnaVez(true);
    } finally {
      setGuardando(false);
    }
  };

  const todoGuardado = subidas.every((s) => s.fase === "guardada" || s.fase === "error" || (s.fase === "lista" && !s.guardar && guardadoUnaVez));

  const enComparacion = comparando != null ? subidas[comparando] : null;
  const ladoParecido = (id: string): Lado => {
    if (id.startsWith(DE_ESTA_SUBIDA)) {
      const j = Number(id.slice(DE_ESTA_SUBIDA.length));
      return { tipo: "nuevo", archivo: subidas[j].archivo, texto: subidas[j].texto };
    }
    return { tipo: "boveda", doc: indice.porId(id)!, texto: indice.texto(id) ?? "" };
  };

  return (
    <div className="panel subir" role="dialog" aria-label="Subir archivos">
      {enComparacion && comparando != null && enComparacion.parecidos[0] && (
        <Comparar
          modo="subida" raiz={raiz} par={enComparacion.parecidos[0]}
          a={{ tipo: "nuevo", archivo: enComparacion.archivo, texto: enComparacion.texto }}
          b={ladoParecido(enComparacion.parecidos[0].id)}
          alCerrar={() => setComparando(null)}
          alDecidir={async (d) => {
            const otro = enComparacion.parecidos[0].id;
            cambiar(comparando, {
              guardar: d !== "no agregar", decidido: d,
              reemplaza: d === "reemplazar" && !otro.startsWith(DE_ESTA_SUBIDA) ? otro : undefined,
            });
            setComparando(null);
          }}
        />
      )}
      <h3>Subir {archivos.length === 1 ? "1 archivo" : `${archivos.length} archivos`}</h3>
      {carpetas.length === 0 && <p className="nota">No tienes carpetas todavía: se guardarán en la carpeta principal. Crea carpetas para recibir sugerencias.</p>}
      {avisoIa && <p className="error">{avisoIa}</p>}
      <ul className="subidas">
        {subidas.map((s, i) => (
          <li key={i}>
            <span className="nombre">{s.archivo.name}</span>
            <span className="meta">
              {s.fase === "esperando" && "En espera…"}
              {s.fase === "leyendo" && "Leyendo…"}
              {s.fase === "sugiriendo" && "Buscando la carpeta…"}
              {s.fase === "lista" && !s.guardar && guardadoUnaVez && "No se guardó"}
              {s.fase === "lista" && !(guardadoUnaVez && !s.guardar) && (s.estado === "listo" ? `${s.texto.length.toLocaleString("es-DO")} letras leídas` : estadoCorto(s.estado))}
              {s.fase === "lista" && s.vence?.vence && (
                <> · Vence: {fechaCorta(s.vence.vence)} ({cuandoVence(s.vence.vence, hoy)}){s.vence.venceEstado === "por confirmar" && `, «${s.vence.venceTexto}» se puede leer de dos formas: confírmala en su ficha`}</>
              )}
              {s.fase === "guardada" && `Guardado en ${s.ruta}${s.aviso ? ` (${s.aviso})` : ""}`}
              {s.fase === "error" && `Error: ${s.aviso ?? "no se pudo leer"}`}
            </span>
            {s.fase === "lista" && s.parecidos.length > 0 && !guardadoUnaVez && (
              <div className={`aviso-dup${s.parecidos[0].tipo === "exacto" ? " exacto" : ""}`} role="alert">
                {s.parecidos.map((p) => {
                  const x = nombreParecido(p.id);
                  return (
                    <p key={p.id}>
                      <b>{etiquetaPar(p)}</b>{" "}
                      {x.enBoveda ? <>de <button className="enlace" onClick={() => alVer(p.id)}>{x.nombre}</button>{x.codigo ? ` (${x.codigo})` : ""}, que ya está en tu bóveda.</> : <>de {x.nombre}, que estás subiendo ahora.</>}
                      {" "}{explicarPar(p)}
                    </p>
                  );
                })}
                {s.decidido && <p className="decidido">{s.decidido === "no agregar" ? "Decidiste no agregarlo." : s.decidido === "agregar" ? "Decidiste agregarlo como sea." : "Se agregará y el que ya estaba irá a la papelera."}</p>}
                <div className="acciones">
                  <button onClick={() => setComparando(i)}>Comparar lado a lado</button>
                  <label className="marcar">
                    <input type="checkbox" checked={s.guardar} onChange={(e) => cambiar(i, { guardar: e.target.checked, reemplaza: undefined, decidido: undefined })} />
                    {s.parecidos[0].tipo === "exacto" ? "Guardar otra copia de todos modos" : "Guardarlo también"}
                  </label>
                </div>
              </div>
            )}
            {s.fase === "lista" && s.guardar && (
              <label className="elegir">Guardar en
                <select value={s.elegida} onChange={(e) => cambiar(i, { elegida: e.target.value })} aria-label={`Carpeta para ${s.archivo.name}`}>
                  {s.orden.map((c) => <option key={c} value={c}>{c}{c === s.sugerida ? " (sugerida)" : ""}</option>)}
                  <option value={PRINCIPAL}>Carpeta principal</option>
                </select>
              </label>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        {!todoGuardado && (
          <button className="primario" onClick={guardar} disabled={guardando || pendientes.length > 0 || listas.length === 0}>
            {pendientes.length > 0 ? `Leyendo (${subidas.length - pendientes.length} de ${subidas.length})…` : "Guardar"}
          </button>
        )}
        <button onClick={() => { cancelado.current = true; alCerrar(); }} disabled={guardando}>{todoGuardado ? "Cerrar" : "Cancelar"}</button>
      </div>
      {!todoGuardado && <p className="nota">Revisa la carpeta de cada archivo. Se copian a tu carpeta solo al pulsar Guardar; los originales no se tocan.</p>}
    </div>
  );
}

function estadoCorto(e: EstadoTexto): string {
  return e === "formato no soportado" ? "Se guardará; solo se podrá buscar por el nombre"
    : e === "sin texto" ? "No tiene texto" : e === "error" ? "No se pudo leer; se guardará igual" : "";
}
