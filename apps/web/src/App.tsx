import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Indice, type FichaDocumento, type Hallazgo } from "@docvault/indice";
import {
  borrarIndiceGuardado, guardarIndice, leerCarpetaRecordada, leerIndiceGuardado,
  pedirAlmacenamientoPersistente, recordarCarpeta,
} from "./almacen";
import { archivoPorRuta, elegirCarpeta, navegadorCompatible, pedirPermiso, tienePermiso } from "./carpeta";
import { actualizarIndice, type Avance, type ResumenIndexado } from "./indexar";

type Pantalla = "cargando" | "incompatible" | "sin-carpeta" | "sin-permiso" | "lista";

const MAX_FILAS = 500;
const ESTADOS: Record<string, string> = {
  "listo": "Con texto",
  "sin texto": "Vacío",
  "pendiente de OCR": "Espera OCR",
  "formato no soportado": "Solo nombre",
  "error": "No se pudo leer",
};

export function App() {
  const [pantalla, setPantalla] = useState<Pantalla>("cargando");
  const [carpeta, setCarpeta] = useState<FileSystemDirectoryHandle | null>(null);
  const indice = useRef<Indice | null>(null);
  const [docs, setDocs] = useState<FichaDocumento[]>([]);
  const [consulta, setConsulta] = useState("");
  const [avance, setAvance] = useState<Avance | null>(null);
  const [resumen, setResumen] = useState<ResumenIndexado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ocupado = useRef(false);

  const actualizar = useCallback(async (h: FileSystemDirectoryHandle) => {
    if (!indice.current || ocupado.current) return;
    ocupado.current = true;
    setError(null);
    try {
      const r = await actualizarIndice(h, indice.current, setAvance);
      await guardarIndice(indice.current.exportar());
      setDocs(indice.current.listar());
      setResumen(r);
    } catch (e) {
      setError(`No se pudo leer la carpeta: ${String(e)}`);
    } finally {
      ocupado.current = false;
      setAvance(null);
    }
  }, []);

  const abrir = useCallback(async (h: FileSystemDirectoryHandle, nueva: boolean) => {
    if (nueva) {
      await borrarIndiceGuardado();
      await recordarCarpeta(h);
      void pedirAlmacenamientoPersistente();
    }
    indice.current?.cerrar();
    indice.current = await Indice.abrir(nueva ? null : await leerIndiceGuardado());
    setCarpeta(h);
    setDocs(indice.current.listar());
    setResumen(null);
    setConsulta("");
    setPantalla("lista");
    await actualizar(h);
  }, [actualizar]);

  // Al abrir la app: ¿hay una carpeta recordada y sigue el permiso?
  useEffect(() => {
    (async () => {
      if (!navegadorCompatible()) { setPantalla("incompatible"); return; }
      const h = await leerCarpetaRecordada();
      if (!h) { setPantalla("sin-carpeta"); return; }
      setCarpeta(h);
      if (await tienePermiso(h)) await abrir(h, false);
      else setPantalla("sin-permiso");
    })().catch((e) => { setError(String(e)); setPantalla("sin-carpeta"); });
  }, [abrir]);

  // Gancho para las pruebas automáticas (no se usa al trabajar normalmente).
  useEffect(() => {
    if (import.meta.env.DEV || location.search.includes("pruebas")) {
      (window as unknown as { __docvault: unknown }).__docvault = {
        usarCarpeta: (h: FileSystemDirectoryHandle) => abrir(h, true),
        actualizar: () => carpeta && actualizar(carpeta),
      };
    }
  }, [abrir, actualizar, carpeta]);

  const onElegir = async () => {
    try { await abrir(await elegirCarpeta(), true); }
    catch (e) { if ((e as DOMException).name !== "AbortError") setError(String(e)); }
  };
  const onReabrir = async () => {
    if (carpeta && (await pedirPermiso(carpeta))) await abrir(carpeta, false);
  };
  const onAbrirDocumento = async (ruta: string) => {
    if (!carpeta) return;
    try {
      const f = await archivoPorRuta(carpeta, ruta);
      const url = URL.createObjectURL(f);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError(`No encontré "${ruta}". Puede que lo hayan movido; pulsa Actualizar.`);
    }
  };

  const hallazgos: Hallazgo[] | null = useMemo(() => {
    const q = consulta.trim();
    if (!q || !indice.current) return null;
    try { return indice.current.buscar(q, 50); } catch { return []; }
  }, [consulta, docs]);
  const porId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const cuenta = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of docs) c[d.estadoTexto ?? "error"] = (c[d.estadoTexto ?? "error"] ?? 0) + 1;
    return c;
  }, [docs]);

  if (pantalla === "cargando") return <main className="centro"><p>Abriendo…</p></main>;

  if (pantalla === "incompatible") return (
    <main className="centro">
      <h1>DOCVAULT</h1>
      <p>Esta app necesita Google Chrome o Microsoft Edge en una computadora, porque trabaja con una carpeta de tu equipo.</p>
    </main>
  );

  if (pantalla === "sin-carpeta" || pantalla === "sin-permiso") return (
    <main className="centro">
      <h1>DOCVAULT</h1>
      <p className="sub">Tu bóveda de documentos. Todo se queda en tu computadora.</p>
      {pantalla === "sin-permiso" && carpeta ? (
        <>
          <button className="primario" onClick={onReabrir}>Volver a abrir «{carpeta.name}»</button>
          <p className="nota">Chrome pide confirmar el permiso a la carpeta cada cierto tiempo. Instalar la app ayuda a que lo recuerde.</p>
          <button className="enlace" onClick={onElegir}>Elegir otra carpeta</button>
        </>
      ) : (
        <>
          <button className="primario" onClick={onElegir}>Elegir la carpeta de mis documentos</button>
          <p className="nota">DOCVAULT lee la carpeta que elijas y sus subcarpetas para poder buscar en tus documentos. No cambia ni mueve nada, y nada sale de tu equipo.</p>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );

  const lista = hallazgos
    ? hallazgos.map((h) => ({ ficha: porId.get(h.id), id: h.id, fragmento: h.fragmento }))
    : docs.slice(0, MAX_FILAS).map((d) => ({ ficha: d, id: d.id, fragmento: "" }));

  return (
    <main>
      <header>
        <div>
          <h1>DOCVAULT</h1>
          <p className="sub">Carpeta: <b>{carpeta?.name}</b> · {docs.length.toLocaleString("es-DO")} documentos</p>
        </div>
        <div className="acciones">
          <button onClick={() => carpeta && actualizar(carpeta)} disabled={!!avance}>Actualizar</button>
          <button onClick={onElegir} disabled={!!avance}>Cambiar carpeta</button>
        </div>
      </header>

      {avance && (
        <div className="avance" role="status">
          {avance.fase === "buscando" && `Buscando archivos… ${avance.hechos}`}
          {avance.fase === "leyendo" && `Leyendo ${avance.hechos + 1} de ${avance.total}: ${avance.actual}`}
          {avance.fase === "guardando" && "Guardando el índice…"}
          {avance.fase === "leyendo" && <progress max={avance.total} value={avance.hechos} />}
        </div>
      )}
      {!avance && resumen && (
        <p className="estado" role="status">
          Índice al día en {resumen.segundos.toFixed(1)} s: {resumen.nuevos} nuevos, {resumen.actualizados} cambiados, {resumen.quitados} quitados, {resumen.sinCambios} sin cambios.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <input
        className="buscar" type="search" autoFocus placeholder="Buscar en nombres y en el texto de los documentos"
        value={consulta} onChange={(e) => setConsulta(e.target.value)} aria-label="Buscar"
      />

      <p className="cuenta">
        {Object.entries(ESTADOS).filter(([k]) => cuenta[k]).map(([k, v]) => `${v}: ${cuenta[k]}`).join(" · ")}
        {cuenta["pendiente de OCR"] ? " (las fotos y escaneos se leerán con OCR en la próxima entrega)" : ""}
      </p>

      {hallazgos && <p className="cuenta">{hallazgos.length === 0 ? "Sin resultados." : `${hallazgos.length} resultado${hallazgos.length === 1 ? "" : "s"}`}</p>}

      <ul className="docs">
        {lista.map(({ ficha, id, fragmento }) => (
          <li key={id}>
            <button className="doc" onClick={() => onAbrirDocumento(id)} title="Abrir">
              <span className="nombre">{id.split("/").at(-1)}</span>
              <span className="meta">
                {ficha?.carpeta ? `${ficha.carpeta} · ` : ""}{(ficha?.tipo || "sin extensión").toUpperCase()} · {tamano(ficha?.tamano)}
                {ficha?.modificado ? ` · ${new Date(ficha.modificado).toLocaleDateString("es-DO")}` : ""}
                {ficha?.estadoTexto && ficha.estadoTexto !== "listo" ? ` · ${ESTADOS[ficha.estadoTexto]}` : ""}
              </span>
              {fragmento && <span className="fragmento">{resaltar(fragmento)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {!hallazgos && docs.length > MAX_FILAS && <p className="cuenta">Mostrando {MAX_FILAS} de {docs.length}. Usa la búsqueda para encontrar el resto.</p>}
    </main>
  );
}

function tamano(b?: number | null): string {
  if (b == null) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}

function resaltar(f: string) {
  return f.split(/(\u0002[^\u0003]*\u0003)/).map((p, i) =>
    p.startsWith("\u0002") ? <mark key={i}>{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>);
}
