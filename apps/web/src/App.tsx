import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { abrirEnPestana, estampar, sePuedeEstampar } from "./estampar";
import { Indice, type EstadoVence, type FichaDocumento } from "@docvault/indice";
import { duplicadosEnBoveda, leerCodigo, UMBRALES_DUPLICADOS, type Par } from "@docvault/core";
import { Alertas } from "./Alertas";
import { Comparar } from "./Comparar";
import { Escanear } from "./Escanear";
import { Papelera } from "./PanelPapelera";
import { borrarParaSiempre, leerPapelera, moverAPapelera, recuperar, type EnPapelera } from "./papelera";
import { avisarVencimientos } from "./avisos";
import { aplicarGuardados, guardarDecision, guardarVencimientosEnCarpeta, leerVencimientosGuardados } from "./vencimientos";
import {
  borrarIndiceGuardado, guardarIndice, leerCarpetaRecordada, leerIndiceGuardado,
  pedirAlmacenamientoPersistente, recordarCarpeta,
} from "./almacen";
import { archivoPorRuta, elegirCarpeta, leerCarpetas, navegadorCompatible, pedirPermiso, tienePermiso, type Carpeta } from "./carpeta";
import { Carpetas, SIN_CARPETA, tonoDe, type ResumenCarpeta } from "./Carpetas";
import { asignarFaltantes, guardarCodigosEnCarpeta, leerCodigosGuardados } from "./codigos";
import { Documentos, dudoso, ESTADOS, nombreDe, type Elemento } from "./Documentos";
import { descargarExcel } from "./exportar";
import { Ficha } from "./Ficha";
import { Subir } from "./Subir";
import { actualizarIndice, fichaDe, hashDe, leerTexto, type Avance, type ResumenIndexado } from "./indexar";
import { ColaOcr, type AvanceOcr, type ResumenOcr } from "./ocr";

type Pantalla = "cargando" | "incompatible" | "sin-carpeta" | "sin-permiso" | "lista";

const MAX_TARJETAS = 400;
const RECIENTES = 24;

/** La carpeta de primer nivel de un documento ("" si está suelto en la principal). */
const carpetaDe = (id: string) => (id.includes("/") ? id.slice(0, id.indexOf("/")) : SIN_CARPETA);

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
  const [avanceOcr, setAvanceOcr] = useState<AvanceOcr | null>(null);
  const [resumenOcr, setResumenOcr] = useState<ResumenOcr | null>(null);
  const cola = useRef<{ cola: ColaOcr; fin: Promise<unknown> } | null>(null);
  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [subiendo, setSubiendo] = useState<File[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [vista, setVista] = useState<"fila" | "cuadricula">("fila");
  const [soloCarpeta, setSoloCarpeta] = useState(true);
  const elegirArchivos = useRef<HTMLInputElement>(null);
  const [duplicados, setDuplicados] = useState<Par[]>([]);
  const [comparando, setComparando] = useState<Par | null>(null);
  const [papelera, setPapelera] = useState<EnPapelera[]>([]);
  const [verPapelera, setVerPapelera] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const cacheHuellas = useRef(new Map<string, { clave: string; huella: Set<string>; firma: Uint32Array }>());

  /** Busca duplicados en toda la bóveda (sin los pares que el usuario dijo que no lo son). */
  const revisarDuplicados = useCallback(() => {
    const idx = indice.current;
    if (!idx) return;
    const ignorados = new Set<string>(JSON.parse(idx.ajuste("duplicados_ignorados") ?? "[]"));
    const docsIdx = new Map(idx.listar().map((d) => [d.id, d]));
    const clave = (a: string, b: string) => [docsIdx.get(a)?.codigo ?? a, docsIdx.get(b)?.codigo ?? b].sort().join("|");
    const pares = duplicadosEnBoveda(idx.paraComparar(), UMBRALES_DUPLICADOS, cacheHuellas.current);
    setDuplicados(pares.filter((p) => !ignorados.has(clave(p.a, p.b))));
  }, []);

  /** Avisos del navegador para lo vencido o por vencer (solo si el usuario los activó). */
  const avisar = useCallback(() => {
    const idx = indice.current;
    if (!idx) return;
    if (avisarVencimientos(idx, idx.listar(), (id) => setElegido(id)) > 0) void guardarIndice(idx.exportar());
  }, []);

  const releerCarpetas = useCallback(async (h: FileSystemDirectoryHandle) => {
    try { setCarpetas(await leerCarpetas(h)); } catch { setCarpetas([]); }
  }, []);

  /** Detiene el OCR en curso y espera a que suelte el documento que estaba leyendo. */
  const pararOcr = useCallback(async () => {
    const c = cola.current;
    if (!c) return;
    c.cola.parar();
    await c.fin;
  }, []);

  /** Lee con OCR, en segundo plano, las fotos y escaneos que falten. */
  const empezarOcr = useCallback((h: FileSystemDirectoryHandle) => {
    const idx = indice.current;
    if (!idx || cola.current) return;
    const c = new ColaOcr();
    const fin = c.correr(
      h, idx,
      (a) => { setAvanceOcr(a); setDocs(idx.listar()); },
      () => guardarIndice(idx.exportar()),
    ).then((r) => {
      if (r.leidos + r.errores > 0) setResumenOcr(r);
      setDocs(idx.listar());
      if (r.leidos > 0) { revisarDuplicados(); avisar(); }
    }).catch((e) => setError(`El OCR se detuvo: ${String(e)}`))
      .finally(() => { cola.current = null; setAvanceOcr(null); });
    cola.current = { cola: c, fin };
  }, [revisarDuplicados, avisar]);

  const actualizar = useCallback(async (h: FileSystemDirectoryHandle) => {
    if (!indice.current || ocupado.current) return;
    ocupado.current = true;
    setError(null);
    try {
      await pararOcr();
      const r = await actualizarIndice(h, indice.current, setAvance);
      aplicarGuardados(indice.current, await leerVencimientosGuardados(h));
      await guardarIndice(indice.current.exportar());
      await guardarCodigosEnCarpeta(h, indice.current);
      setDocs(indice.current.listar());
      revisarDuplicados();
      avisar();
      setPapelera(await leerPapelera(h));
      setResumen(r);
      await releerCarpetas(h);
    } catch (e) {
      setError(`No se pudo leer la carpeta: ${String(e)}`);
    } finally {
      ocupado.current = false;
      setAvance(null);
    }
    empezarOcr(h);
  }, [pararOcr, empezarOcr, releerCarpetas, revisarDuplicados, avisar]);

  const abrir = useCallback(async (h: FileSystemDirectoryHandle, nueva: boolean) => {
    await pararOcr();
    setResumenOcr(null);
    setElegido(null);
    setAbierta(null);
    setSubiendo(null);
    setAviso(null);
    setDuplicados([]);
    cacheHuellas.current.clear();
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
  }, [actualizar, pararOcr]);

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

  // Un enlace con #DV-000123 abre la ficha de ese documento.
  useEffect(() => {
    if (pantalla !== "lista") return;
    const ir = () => {
      const c = leerCodigo(decodeURIComponent(location.hash.slice(1)));
      const d = c ? indice.current?.porCodigo(c) : null;
      if (d) setElegido(d.id);
    };
    ir();
    addEventListener("hashchange", ir);
    return () => removeEventListener("hashchange", ir);
  }, [pantalla, docs.length]);

  const porId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const ficha = elegido ? porId.get(elegido) ?? null : null;

  // La dirección muestra el código del documento abierto, para guardarla o compartirla.
  useEffect(() => {
    if (pantalla !== "lista") return;
    const hash = ficha?.codigo ? `#${ficha.codigo}` : "";
    if (location.hash !== hash) history.replaceState(null, "", hash || location.pathname + location.search);
  }, [ficha, pantalla]);

  const onElegir = async () => {
    try { await abrir(await elegirCarpeta(), true); }
    catch (e) { if ((e as DOMException).name !== "AbortError") setError(String(e)); }
  };
  const onReabrir = async () => {
    if (carpeta && (await pedirPermiso(carpeta))) await abrir(carpeta, false);
  };
  const onAbrirDocumento = async (ruta: string, codigo?: string | null, tipo?: string | null) => {
    if (!carpeta) return;
    try {
      // PDF y fotos se abren con su código al pie: si se imprimen desde esa pestaña,
      // salen con el QR y el código de barras. El archivo de la carpeta no cambia.
      if (codigo && sePuedeEstampar(tipo)) {
        const abierta = await abrirEnPestana(
          async () => estampar(await archivoPorRuta(carpeta, ruta), tipo ?? "", codigo),
          () => archivoPorRuta(carpeta, ruta),
        );
        if (!abierta) setError("Chrome bloqueó la pestaña nueva. Permite las ventanas emergentes de esta página.");
        return;
      }
      const f = await archivoPorRuta(carpeta, ruta);
      const url = URL.createObjectURL(f);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError(`No encontré "${ruta}". Puede que lo hayan movido; pulsa Actualizar.`);
    }
  };
  const cerrarFicha = useCallback(() => setElegido(null), []);

  /** Un código escaneado o escrito: abre la ficha del documento y muestra su carpeta. */
  const abrirPorCodigo = useCallback((codigo: string): boolean => {
    const d = indice.current?.porCodigo(codigo);
    if (!d) return false;
    setEscaneando(false);
    setConsulta("");
    setAbierta(carpetaDe(d.id));
    setElegido(d.id);
    return true;
  }, []);

  // Un lector USB "escribe" el código muy rápido y pulsa Enter. Si eso pasa fuera del
  // buscador (en cualquier parte de la app), igual se abre el documento.
  useEffect(() => {
    if (pantalla !== "lista") return;
    let buffer = "";
    let ultima = 0;
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const ahora = performance.now();
      if (ahora - ultima > 100) buffer = ""; // un lector USB "teclea" cada pocos milisegundos
      ultima = ahora;
      if (e.key === "Enter") {
        const c = buffer.length >= 6 ? leerCodigo(buffer) : null;
        buffer = "";
        if (c && abrirPorCodigo(c)) e.preventDefault();
        else if (c) setAviso(`${c} no está en esta bóveda.`);
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    };
    addEventListener("keydown", tecla);
    return () => removeEventListener("keydown", tecla);
  }, [pantalla, abrirPorCodigo]);

  // Mientras la app está abierta, revisa los vencimientos cada hora (por si cambia el día).
  useEffect(() => {
    if (pantalla !== "lista") return;
    const t = setInterval(() => { avisar(); setDocs((d) => [...d]); }, 60 * 60 * 1000);
    return () => clearInterval(t);
  }, [pantalla, avisar]);

  const cambiarVence = async (id: string, vence: string | null, estado: EstadoVence) => {
    const idx = indice.current;
    if (!idx || !carpeta) return;
    const enCarpeta = await guardarDecision(carpeta, idx, id, vence, estado);
    await guardarIndice(idx.exportar());
    setDocs(idx.listar());
    setAviso(enCarpeta ? null : "Guardé la fecha en la app. Sin permiso para escribir en la carpeta, se perdería si hubiera que reconstruir el índice.");
  };

  const ignorarDuplicado = async (p: Par) => {
    const idx = indice.current;
    if (!idx) return;
    const ignorados = new Set<string>(JSON.parse(idx.ajuste("duplicados_ignorados") ?? "[]"));
    ignorados.add([porId.get(p.a)?.codigo ?? p.a, porId.get(p.b)?.codigo ?? p.b].sort().join("|"));
    idx.ponerAjuste("duplicados_ignorados", JSON.stringify([...ignorados]));
    await guardarIndice(idx.exportar());
    setDuplicados((d) => d.filter((x) => x !== p));
  };

  /** Después de quitar o recuperar archivos: guardar todo y volver a mirar duplicados. */
  const despuesDeCambiar = async () => {
    const idx = indice.current;
    if (!idx || !carpeta) return;
    await guardarIndice(idx.exportar());
    await guardarCodigosEnCarpeta(carpeta, idx);
    await guardarVencimientosEnCarpeta(carpeta, idx);
    setDocs(idx.listar());
    revisarDuplicados();
    setPapelera(await leerPapelera(carpeta));
  };

  const quitarDuplicado = async (id: string, otro: string) => {
    const idx = indice.current;
    if (!idx || !carpeta) return;
    await moverAPapelera(carpeta, idx, id, `duplicado de ${otro.split("/").at(-1)}`);
    if (elegido === id) setElegido(null);
    await despuesDeCambiar();
    setAviso(`«${id.split("/").at(-1)}» está en la papelera. Puedes recuperarlo desde «Papelera».`);
  };

  const recuperarDePapelera = async (e: EnPapelera) => {
    const idx = indice.current;
    if (!idx || !carpeta) return;
    const { ruta, archivo } = await recuperar(carpeta, e);
    const { texto, estado } = await leerTexto(archivo);
    const codigo = e.codigo && !idx.porCodigo(e.codigo) ? e.codigo : null;
    idx.agregar([fichaDe(ruta, archivo, texto, estado, null, codigo, await hashDe(archivo))]);
    asignarFaltantes(idx, await leerCodigosGuardados(carpeta));
    aplicarGuardados(idx, await leerVencimientosGuardados(carpeta));
    await despuesDeCambiar();
    setAviso(`Recuperé «${ruta.split("/").at(-1)}» en ${ruta.includes("/") ? ruta.slice(0, ruta.lastIndexOf("/")) : "la carpeta principal"}.`);
    if (estado === "pendiente de OCR") empezarOcr(carpeta);
  };

  const borrarDePapelera = async (e: EnPapelera) => {
    if (!carpeta) return;
    await borrarParaSiempre(carpeta, e);
    setPapelera(await leerPapelera(carpeta));
  };

  /** Resultados: primero el documento cuyo código se escribió, luego los del texto. */
  const resultados: { elementos: Elemento[]; exacto: FichaDocumento | null } | null = useMemo(() => {
    const q = consulta.trim();
    if (!q || !indice.current) return null;
    const c = leerCodigo(q);
    const exacto = c ? indice.current.porCodigo(c) : null;
    let hallazgos: Elemento[] = [];
    try {
      hallazgos = indice.current.buscar(q, 60)
        .filter((h) => h.id !== exacto?.id)
        .flatMap((h) => { const doc = porId.get(h.id); return doc ? [{ doc, fragmento: h.fragmento }] : []; });
    } catch { /* consulta que el buscador no entiende: sin resultados */ }
    let elementos = exacto ? [{ doc: exacto }, ...hallazgos] : hallazgos;
    if (abierta !== null && soloCarpeta) elementos = elementos.filter((e) => carpetaDe(e.doc.id) === abierta);
    return { elementos, exacto };
  }, [consulta, porId, abierta, soloCarpeta]);

  const resumenCarpetas: ResumenCarpeta[] = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const d of docs) cuenta.set(carpetaDe(d.id), (cuenta.get(carpetaDe(d.id)) ?? 0) + 1);
    const lista: ResumenCarpeta[] = carpetas.map((c) => ({ ...c, documentos: cuenta.get(c.nombre) ?? 0, existe: true }));
    for (const [nombre, n] of cuenta) {
      if (nombre !== SIN_CARPETA && !carpetas.some((c) => c.nombre === nombre)) lista.push({ nombre, descripcion: "", documentos: n, existe: true });
    }
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    if (cuenta.get(SIN_CARPETA)) lista.push({ nombre: SIN_CARPETA, descripcion: "", documentos: cuenta.get(SIN_CARPETA)!, existe: false });
    return lista;
  }, [docs, carpetas]);

  const enCarpeta = useMemo(() => abierta === null ? [] : docs
    .filter((d) => carpetaDe(d.id) === abierta)
    .sort((a, b) => (b.modificado ?? 0) - (a.modificado ?? 0)), [docs, abierta]);
  const recientes = useMemo(() => [...docs].sort((a, b) => (b.modificado ?? 0) - (a.modificado ?? 0)).slice(0, RECIENTES), [docs]);

  const cuenta = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of docs) {
      c[d.estadoTexto ?? "error"] = (c[d.estadoTexto ?? "error"] ?? 0) + 1;
      if (dudoso(d)) c.revisar = (c.revisar ?? 0) + 1;
      if (d.venceEstado === "por confirmar") c.confirmar = (c.confirmar ?? 0) + 1;
    }
    return c;
  }, [docs]);

  if (pantalla === "cargando") return <main className="centro"><p>Abriendo…</p></main>;

  if (pantalla === "incompatible") return (
    <main className="centro">
      <Marca />
      <p>Esta app necesita Google Chrome o Microsoft Edge en una computadora, porque trabaja con una carpeta de tu equipo.</p>
    </main>
  );

  if (pantalla === "sin-carpeta" || pantalla === "sin-permiso") return (
    <main className="centro">
      <Marca />
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

  const nombreAbierta = abierta === SIN_CARPETA ? "Sin carpeta" : abierta;
  const infoAbierta = resumenCarpetas.find((c) => c.nombre === abierta);

  return (
    <div
      className="app"
      onDragOver={(e) => { if (carpeta && !subiendo) e.preventDefault(); }}
      onDrop={(e) => {
        if (!carpeta || subiendo) return;
        e.preventDefault();
        const f = [...e.dataTransfer.files];
        if (f.length) { setAviso(null); setSubiendo(f); }
      }}
    >
      <header className="barra">
        <Marca />
        <div className="buscador">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            type="search" autoFocus placeholder="Busca por nombre, texto o código (DV-000123)"
            value={consulta} onChange={(e) => setConsulta(e.target.value)} aria-label="Buscar"
            onKeyDown={(e) => {
              // Un lector de código de barras escribe el código y pulsa Enter: abre la ficha.
              if (e.key === "Enter") {
                const c = resultados?.exacto?.codigo ?? leerCodigo(consulta);
                if (c && !abrirPorCodigo(c)) setAviso(`${c} no está en esta bóveda.`);
              }
              if (e.key === "Escape") setConsulta("");
            }}
          />
        </div>
        <div className="acciones">
          <button onClick={() => setEscaneando(true)} disabled={!docs.length} title="Escanea el código impreso con la cámara de la computadora">
            <svg className="icono" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8" /></svg>
            Escanear
          </button>
          <button onClick={() => descargarExcel(docs)} disabled={!docs.length}>Exportar a Excel</button>
          <button className="primario" onClick={() => elegirArchivos.current?.click()} disabled={!!avance || !!subiendo}>Subir archivos</button>
          <input
            ref={elegirArchivos} type="file" multiple hidden aria-label="Elegir archivos para subir"
            onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) { setAviso(null); setSubiendo(f); } }}
          />
        </div>
      </header>

      <main>
        <div className="contexto">
          <p>
            Carpeta <b>{carpeta?.name}</b> · {docs.length.toLocaleString("es-DO")} documentos
            <span className="cuenta">
              {" · "}{Object.entries(ESTADOS).filter(([k]) => cuenta[k]).map(([k, v]) => `${v}: ${cuenta[k]}`).join(" · ")}
              {cuenta.revisar ? ` · Para revisar: ${cuenta.revisar}` : ""}
              {cuenta.confirmar ? ` · Fechas por confirmar: ${cuenta.confirmar}` : ""}
            </span>
          </p>
          <div className="acciones">
            <button onClick={() => carpeta && actualizar(carpeta)} disabled={!!avance}>Actualizar</button>
            <button onClick={onElegir} disabled={!!avance}>Cambiar carpeta</button>
          </div>
        </div>

        {avance && (
          <div className="avance" role="status">
            {avance.fase === "buscando" && `Buscando archivos… ${avance.hechos}`}
            {avance.fase === "leyendo" && `Leyendo ${avance.hechos + 1} de ${avance.total}: ${avance.actual}`}
            {avance.fase === "completando" && `Buscando fechas de vencimiento y duplicados (${avance.hechos + 1} de ${avance.total})…`}
            {avance.fase === "guardando" && "Guardando el índice…"}
            {(avance.fase === "leyendo" || avance.fase === "completando") && <progress max={avance.total} value={avance.hechos} />}
          </div>
        )}
        {!avance && resumen && (
          <p className="estado" role="status">
            Índice al día en {resumen.segundos.toFixed(1)} s: {resumen.nuevos} nuevos, {resumen.actualizados} cambiados, {resumen.quitados} quitados, {resumen.sinCambios} sin cambios.
            {resumen.movidos > 0 && ` ${resumen.movidos} ${resumen.movidos === 1 ? "movido o renombrado" : "movidos o renombrados"}, con el mismo código.`}
          </p>
        )}
        {avanceOcr && (
          <div className="avance" role="status" aria-label="OCR">
            Leyendo fotos y escaneos ({avanceOcr.hechos + 1} de {avanceOcr.total}): {avanceOcr.actual}
            <progress max={avanceOcr.total} value={avanceOcr.hechos} />
            <span className="nota">Puedes seguir buscando mientras tanto.</span>
          </div>
        )}
        {!avanceOcr && resumenOcr && (
          <p className="estado" role="status" aria-label="OCR">
            Fotos y escaneos leídos en {resumenOcr.segundos.toFixed(0)} s: {resumenOcr.leidos} leídos
            {resumenOcr.dudosos ? `, ${resumenOcr.dudosos} para revisar` : ""}
            {resumenOcr.vacios ? `, ${resumenOcr.vacios} sin texto` : ""}
            {resumenOcr.errores ? `, ${resumenOcr.errores} no se pudieron leer` : ""}.
          </p>
        )}
        {error && <p className="error">{error}</p>}
        {aviso && <p className="estado" role="status">{aviso}</p>}

        {verPapelera && (
          <Papelera archivos={papelera} alRecuperar={recuperarDePapelera} alBorrar={borrarDePapelera} alCerrar={() => setVerPapelera(false)} />
        )}

        {subiendo && carpeta && indice.current && (
          <Subir
            raiz={carpeta} indice={indice.current} carpetas={carpetas} archivos={subiendo}
            alGuardar={async (rutas) => {
              const idx = indice.current;
              if (!idx) return;
              asignarFaltantes(idx, await leerCodigosGuardados(carpeta));
              await guardarIndice(idx.exportar());
              await guardarCodigosEnCarpeta(carpeta, idx);
              await guardarVencimientosEnCarpeta(carpeta, idx);
              setDocs(idx.listar());
              revisarDuplicados();
              avisar();
              setPapelera(await leerPapelera(carpeta));
              await releerCarpetas(carpeta);
              setAviso(`${rutas.length} ${rutas.length === 1 ? "archivo guardado" : "archivos guardados"} en tu carpeta.`);
            }}
            alCerrar={() => setSubiendo(null)}
            alVer={setElegido}
          />
        )}

        {resultados && carpeta ? (
          <section className="resultados" aria-label="Resultados">
            <div className="seccion-titulo">
              <h2>{resultados.elementos.length === 0 ? "Sin resultados" : `${resultados.elementos.length} resultado${resultados.elementos.length === 1 ? "" : "s"}`}</h2>
              {abierta !== null && (
                <label className="filtro">
                  <input type="checkbox" checked={soloCarpeta} onChange={(e) => setSoloCarpeta(e.target.checked)} />
                  Solo en {nombreAbierta}
                </label>
              )}
            </div>
            {resultados.exacto && <p className="nota">Código {resultados.exacto.codigo}: {nombreDe(resultados.exacto.id)}. Pulsa Enter para abrir su ficha.</p>}
            <Documentos raiz={carpeta} elementos={resultados.elementos} vista="cuadricula" elegido={elegido} alElegir={setElegido} etiqueta="Resultados de la búsqueda" />
          </section>
        ) : carpeta && (
          <>
            {docs.length > 0 && abierta === null && (
              <Alertas
                docs={docs} porId={porId} duplicados={duplicados} alElegir={setElegido} alIgnorar={ignorarDuplicado} alActivarAvisos={avisar}
                alComparar={setComparando} papelera={papelera.length} alVerPapelera={() => setVerPapelera(true)}
              />
            )}
            <Carpetas raiz={carpeta} carpetas={resumenCarpetas} abierta={abierta} alAbrir={setAbierta} alCambiar={() => releerCarpetas(carpeta)} />

            {abierta !== null ? (
              <section className="carpeta-abierta" aria-label={`Documentos de ${nombreAbierta}`} style={{ "--tono": tonoDe(nombreAbierta ?? "") } as CSSProperties}>
                <div className="seccion-titulo">
                  <div>
                    <h2>{nombreAbierta} <span className="nota">· {enCarpeta.length} {enCarpeta.length === 1 ? "documento" : "documentos"}</span></h2>
                    {infoAbierta?.descripcion && <p className="nota">{infoAbierta.descripcion}</p>}
                  </div>
                  <div className="vistas" role="group" aria-label="Vista">
                    <button aria-pressed={vista === "fila"} onClick={() => setVista("fila")}>Fila</button>
                    <button aria-pressed={vista === "cuadricula"} onClick={() => setVista("cuadricula")}>Cuadrícula</button>
                  </div>
                </div>
                {enCarpeta.length === 0
                  ? <p className="vacio">Esta carpeta está vacía. Arrastra archivos aquí o usa «Subir archivos».</p>
                  : <Documentos raiz={carpeta} elementos={enCarpeta.slice(0, MAX_TARJETAS).map((doc) => ({ doc }))} vista={vista} elegido={elegido} alElegir={setElegido} etiqueta={`Documentos de ${nombreAbierta}`} />}
                {enCarpeta.length > MAX_TARJETAS && <p className="nota">Mostrando los {MAX_TARJETAS} más recientes de {enCarpeta.length}. Usa la búsqueda para encontrar el resto.</p>}
              </section>
            ) : recientes.length > 0 && (
              <section className="carpeta-abierta" aria-label="Recientes">
                <div className="seccion-titulo"><h2>Recientes</h2><span className="nota">Mueve el cursor sobre la fila para recorrerla</span></div>
                <Documentos raiz={carpeta} elementos={recientes.map((doc) => ({ doc }))} vista="fila" elegido={elegido} alElegir={setElegido} etiqueta="Documentos recientes" />
              </section>
            )}
          </>
        )}
      </main>

      {escaneando && <Escanear alLeer={abrirPorCodigo} alCerrar={() => setEscaneando(false)} />}

      {comparando && carpeta && indice.current && porId.get(comparando.a) && porId.get(comparando.b) && (
        <Comparar
          modo="boveda" raiz={carpeta} par={comparando}
          a={{ tipo: "boveda", doc: porId.get(comparando.a)!, texto: indice.current.texto(comparando.a) ?? "" }}
          b={{ tipo: "boveda", doc: porId.get(comparando.b)!, texto: indice.current.texto(comparando.b) ?? "" }}
          alCerrar={() => setComparando(null)}
          alDecidir={async (d) => {
            const p = comparando;
            if (d === "no son") await ignorarDuplicado(p);
            else if (d !== "dejar") await quitarDuplicado(d.quitar, d.quitar === p.a ? p.b : p.a);
            setComparando(null);
          }}
        />
      )}

      {ficha && carpeta && (
        <Ficha
          raiz={carpeta} doc={ficha}
          texto={() => indice.current?.texto(ficha.id) ?? ""}
          alAbrir={() => onAbrirDocumento(ficha.id, ficha.codigo, ficha.tipo)}
          alCerrar={cerrarFicha}
          alCambiarVence={(v, e) => cambiarVence(ficha.id, v, e)}
        />
      )}
    </div>
  );
}

function Marca() {
  return (
    <h1 className="marca">
      <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="7" width="26" height="20" rx="4" /><path d="M3 12h26M11 7l2-3h6l2 3" /></svg>
      <span>DOCVAULT</span>
    </h1>
  );
}
