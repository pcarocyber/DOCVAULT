/**
 * Subir archivos: lee cada uno (con OCR si hace falta), sugiere la carpeta con
 * la IA básica, deja la sugerencia marcada, y guarda cuando el usuario confirma.
 * Nada se escribe en la carpeta hasta pulsar "Guardar".
 */
import { useEffect, useRef, useState } from "react";
import type { EstadoTexto, Indice } from "@docvault/indice";
import { MotorOcr } from "@docvault/core/navegador";
import { guardarArchivo, pedirEscritura, type Carpeta } from "./carpeta";
import { extension, fichaDe, leerTexto } from "./indexar";
import { leerConOcr } from "./ocr";
import { sugerirCarpeta } from "./sugerir";

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
}

interface Props {
  raiz: FileSystemDirectoryHandle;
  indice: Indice;
  carpetas: Carpeta[];
  archivos: File[];
  alGuardar: (rutas: string[]) => Promise<void>;
  alCerrar: () => void;
}

export function Subir({ raiz, indice, carpetas, archivos, alGuardar, alCerrar }: Props) {
  const [subidas, setSubidas] = useState<Subida[]>(() => archivos.map((archivo) => ({
    archivo, fase: "esperando", texto: "", estado: "pendiente de OCR", confianza: null,
    orden: carpetas.map((c) => c.nombre), sugerida: null, elegida: PRINCIPAL,
  })));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [avisoIa, setAvisoIa] = useState<string | null>(null);
  const cancelado = useRef(false);

  const cambiar = (i: number, cambio: Partial<Subida>) =>
    setSubidas((s) => s.map((x, j) => (j === i ? { ...x, ...cambio } : x)));

  // Leer y sugerir, uno por uno, en cuanto se abre el panel.
  useEffect(() => {
    cancelado.current = false;
    let motor: MotorOcr | null = null;
    (async () => {
      for (const [i, archivo] of archivos.entries()) {
        if (cancelado.current) break;
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
        if (cancelado.current) break;
        cambiar(i, { fase: "sugiriendo", texto, estado, confianza });
        try {
          const s = await sugerirCarpeta(estado === "listo" ? texto : "", archivo.name, carpetas);
          const mejor = s[0]?.carpeta ?? null;
          cambiar(i, { fase: "lista", orden: s.map((x) => x.carpeta), sugerida: mejor, elegida: mejor ?? PRINCIPAL });
        } catch {
          setAvisoIa("No se pudo cargar la IA básica (¿sin internet la primera vez?). Elige la carpeta a mano.");
          cambiar(i, { fase: "lista" });
        }
      }
    })().finally(() => { void motor?.terminar(); });
    return () => { cancelado.current = true; };
    // Solo al abrir el panel con estos archivos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listas = subidas.filter((s) => s.fase === "lista");
  const pendientes = subidas.filter((s) => s.fase === "esperando" || s.fase === "leyendo" || s.fase === "sugiriendo");

  const guardar = async () => {
    setError(null);
    setGuardando(true);
    try {
      if (!(await pedirEscritura(raiz))) { setError("Sin permiso para escribir en la carpeta no puedo guardar los archivos."); return; }
      const rutas: string[] = [];
      for (const [i, s] of subidas.entries()) {
        if (s.fase !== "lista") continue;
        try {
          const { ruta, guardado } = await guardarArchivo(raiz, s.elegida, s.archivo);
          indice.agregar([fichaDe(ruta, guardado, s.texto, s.estado, s.confianza)]);
          rutas.push(ruta);
          cambiar(i, { fase: "guardada", ruta, aviso: ruta.split("/").at(-1) !== s.archivo.name ? "ya había uno con ese nombre" : undefined });
        } catch (e) {
          cambiar(i, { fase: "error", aviso: `no se pudo guardar: ${String(e)}` });
        }
      }
      await alGuardar(rutas);
    } finally {
      setGuardando(false);
    }
  };

  const todoGuardado = subidas.every((s) => s.fase === "guardada" || s.fase === "error");

  return (
    <div className="panel subir" role="dialog" aria-label="Subir archivos">
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
              {s.fase === "lista" && (s.estado === "listo" ? `${s.texto.length.toLocaleString("es-DO")} letras leídas` : estadoCorto(s.estado))}
              {s.fase === "guardada" && `Guardado en ${s.ruta}${s.aviso ? ` (${s.aviso})` : ""}`}
              {s.fase === "error" && `Error: ${s.aviso ?? "no se pudo leer"}`}
            </span>
            {s.fase === "lista" && (
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
