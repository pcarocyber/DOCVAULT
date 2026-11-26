/**
 * Contraseña de la bóveda: crearla, cambiarla o quitarla (Ajustes), y pedirla antes de
 * mostrar un documento abierto por su código (cámara, lector USB, buscador o enlace).
 * Protege el acceso desde la app; los archivos de la carpeta no se cifran.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { crearClave, problemaDeClave, verificarClave, verificarRecuperacion, type ClaveGuardada } from "@docvault/core";
import { guardarClave, permisoParaGuardar, quitarClave } from "./clave";

/** Después de 5 intentos fallidos, hay que esperar 30 segundos. */
const INTENTOS = 5;
const ESPERA_MS = 30_000;

function useCerrarConEscape(alCerrar: () => void) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") alCerrar(); };
    addEventListener("keydown", tecla);
    return () => removeEventListener("keydown", tecla);
  }, [alCerrar]);
}

function Modal({ titulo, alCerrar, children }: { titulo: string; alCerrar: () => void; children: React.ReactNode }) {
  useCerrarConEscape(alCerrar);
  return (
    <>
      <div className="velo" onClick={alCerrar} aria-hidden="true" />
      <div className="clave" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="comparar-cabeza">
          <h2>{titulo}</h2>
          <button className="cerrar" onClick={alCerrar} aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </>
  );
}

/** Muestra el código de recuperación recién creado. */
function CodigoRecuperacion({ codigo, alListo, listo }: { codigo: string; alListo: () => void; listo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="recuperacion">
      <p>Anota este <strong>código de recuperación</strong> en un lugar seguro, fuera de la computadora. Si olvidas la contraseña, es la única forma de crear una nueva.</p>
      <p className="codigo-recuperacion" aria-label="Código de recuperación">{codigo}</p>
      <div className="acciones">
        <button onClick={async () => { try { await navigator.clipboard.writeText(codigo); setCopiado(true); } catch { /* sin portapapeles */ } }}>{copiado ? "Copiado ✓" : "Copiar"}</button>
        <button className="primario" onClick={alListo}>{listo}</button>
      </div>
      <p className="nota">No lo vuelvo a mostrar.</p>
    </div>
  );
}

/** Formulario de contraseña nueva (dos veces). Guarda y devuelve el código de recuperación. */
function NuevaClave({ raiz, alGuardar, boton }: { raiz: FileSystemDirectoryHandle; alGuardar: (g: ClaveGuardada, recuperacion: string) => void; boton: string }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const p = problemaDeClave(a);
    if (p) { setError(p); return; }
    if (a !== b) { setError("Las dos contraseñas no coinciden."); return; }
    setOcupado(true); setError(null);
    try {
      if (!(await permisoParaGuardar(raiz))) { setError("Sin permiso para escribir en tu carpeta no puedo guardar la contraseña."); return; }
      const { guardada, recuperacion } = await crearClave(a);
      await guardarClave(raiz, guardada);
      alGuardar(guardada, recuperacion);
    } catch (x) {
      setError(`No se pudo guardar: ${x instanceof Error ? x.message : String(x)}`);
    } finally { setOcupado(false); }
  };
  return (
    <form onSubmit={enviar} className="form-clave">
      <label>Contraseña nueva<input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} autoFocus /></label>
      <label>Repítela<input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></label>
      {error && <p className="error-campo" role="alert">{error}</p>}
      <div className="acciones"><button className="primario" type="submit" disabled={ocupado}>{ocupado ? "Guardando…" : boton}</button></div>
    </form>
  );
}

/** Campo de contraseña con límite de intentos. */
function useIntentos() {
  const fallos = useRef(0);
  const [bloqueadoHasta, setBloqueadoHasta] = useState(0);
  const [, refrescar] = useState(0);
  useEffect(() => {
    if (!bloqueadoHasta) return;
    const t = setInterval(() => { refrescar((n) => n + 1); if (Date.now() >= bloqueadoHasta) { setBloqueadoHasta(0); fallos.current = 0; } }, 1000);
    return () => clearInterval(t);
  }, [bloqueadoHasta]);
  const espera = bloqueadoHasta ? Math.max(0, Math.ceil((bloqueadoHasta - Date.now()) / 1000)) : 0;
  const fallo = () => { fallos.current++; if (fallos.current >= INTENTOS) setBloqueadoHasta(Date.now() + ESPERA_MS); };
  return { espera, fallo };
}

/** Pide la contraseña para ver un documento abierto por su código. */
export function PedirClave({ raiz, clave, codigo, alAbrir, alCancelar, alCambiarClave }: {
  raiz: FileSystemDirectoryHandle; clave: ClaveGuardada; codigo: string;
  alAbrir: () => void; alCancelar: () => void; alCambiarClave: (g: ClaveGuardada) => void;
}) {
  const [modo, setModo] = useState<"clave" | "recuperar" | "nueva" | "codigo">("clave");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [recuperacion, setRecuperacion] = useState("");
  const { espera, fallo } = useIntentos();

  const probar = async (e: FormEvent) => {
    e.preventDefault();
    if (espera || !texto) return;
    setRevisando(true); setError(null);
    const ok = modo === "clave" ? await verificarClave(clave, texto) : await verificarRecuperacion(clave, texto);
    setRevisando(false);
    if (ok) { setTexto(""); if (modo === "clave") alAbrir(); else setModo("nueva"); return; }
    fallo();
    setError(modo === "clave" ? "Contraseña incorrecta." : "Ese código de recuperación no es el de esta bóveda.");
  };

  return (
    <Modal titulo="Contraseña de la bóveda" alCerrar={alCancelar}>
      {modo === "codigo" ? (
        <CodigoRecuperacion codigo={recuperacion} listo="Ya lo anoté, abrir el documento" alListo={alAbrir} />
      ) : modo === "nueva" ? (
        <>
          <p>Código correcto. Crea una contraseña nueva para tu bóveda.</p>
          <NuevaClave raiz={raiz} boton="Guardar contraseña nueva" alGuardar={(g, r) => { alCambiarClave(g); setRecuperacion(r); setModo("codigo"); }} />
        </>
      ) : (
        <form onSubmit={probar} className="form-clave">
          <p>Para ver <strong>{codigo}</strong>, escribe {modo === "clave" ? "la contraseña de la bóveda" : "tu código de recuperación"}.</p>
          <label>{modo === "clave" ? "Contraseña" : "Código de recuperación"}
            <input key={modo} type={modo === "clave" ? "password" : "text"} autoComplete={modo === "clave" ? "current-password" : "off"} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
          </label>
          {espera > 0 ? <p className="error-campo" role="alert">Demasiados intentos. Espera {espera} s.</p>
            : error && <p className="error-campo" role="alert">{error}</p>}
          <div className="acciones">
            <button className="primario" type="submit" disabled={revisando || espera > 0}>{revisando ? "Revisando…" : modo === "clave" ? "Ver documento" : "Seguir"}</button>
            <button type="button" className="enlace" onClick={() => { setModo(modo === "clave" ? "recuperar" : "clave"); setTexto(""); setError(null); }}>
              {modo === "clave" ? "Olvidé la contraseña" : "Volver a la contraseña"}
            </button>
          </div>
          <p className="nota">Después de escribirla, durante 5 minutos no te la vuelvo a pedir.</p>
        </form>
      )}
    </Modal>
  );
}

/** Crear, cambiar o quitar la contraseña de la bóveda. */
export function AjustesClave({ raiz, clave, alCambiar, alCerrar }: {
  raiz: FileSystemDirectoryHandle; clave: ClaveGuardada | null;
  alCambiar: (g: ClaveGuardada | null) => void; alCerrar: () => void;
}) {
  const [paso, setPaso] = useState<"inicio" | "nueva" | "codigo" | "quitada">(clave ? "inicio" : "nueva");
  const [actual, setActual] = useState("");
  const [verificada, setVerificada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recuperacion, setRecuperacion] = useState("");
  const { espera, fallo } = useIntentos();

  const comprobar = async (e: FormEvent) => {
    e.preventDefault();
    if (!clave || espera) return;
    setError(null);
    if (await verificarClave(clave, actual) || await verificarRecuperacion(clave, actual)) { setVerificada(true); setActual(""); return; }
    fallo();
    setError("No es la contraseña actual ni el código de recuperación.");
  };

  const quitar = async () => {
    try {
      if (!(await permisoParaGuardar(raiz))) { setError("Sin permiso para escribir en tu carpeta no puedo quitarla."); return; }
      await quitarClave(raiz);
      alCambiar(null);
      setPaso("quitada");
    } catch (x) { setError(`No se pudo quitar: ${x instanceof Error ? x.message : String(x)}`); }
  };

  return (
    <Modal titulo="Contraseña de la bóveda" alCerrar={alCerrar}>
      <p className="nota">Se pide al abrir un documento por su código: con la cámara, un lector USB, el buscador o un enlace. Protege el acceso desde DOCVAULT; los archivos de tu carpeta no se cifran y se pueden abrir desde Finder.</p>
      {paso === "codigo" ? (
        <CodigoRecuperacion codigo={recuperacion} listo="Ya lo anoté" alListo={alCerrar} />
      ) : paso === "quitada" ? (
        <>
          <p>Listo: la bóveda ya no tiene contraseña.</p>
          <div className="acciones"><button className="primario" onClick={alCerrar}>Cerrar</button></div>
        </>
      ) : clave && !verificada ? (
        <form onSubmit={comprobar} className="form-clave">
          <p>Tu bóveda tiene contraseña. Para cambiarla o quitarla, escribe la actual o tu código de recuperación.</p>
          <label>Contraseña actual o código de recuperación<input type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} autoFocus /></label>
          {espera > 0 ? <p className="error-campo" role="alert">Demasiados intentos. Espera {espera} s.</p>
            : error && <p className="error-campo" role="alert">{error}</p>}
          <div className="acciones"><button className="primario" type="submit" disabled={espera > 0}>Seguir</button></div>
        </form>
      ) : (
        <>
          <p>{clave ? "Escribe la contraseña nueva." : "Crea una contraseña para tu bóveda."}</p>
          <NuevaClave raiz={raiz} boton={clave ? "Cambiar contraseña" : "Crear contraseña"} alGuardar={(g, r) => { alCambiar(g); setRecuperacion(r); setPaso("codigo"); }} />
          {clave && (
            <>
              <hr />
              <div className="acciones"><button className="peligro" onClick={quitar}>Quitar la contraseña</button></div>
              {error && <p className="error-campo" role="alert">{error}</p>}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
