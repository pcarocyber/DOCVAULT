/**
 * Las tarjetas de documentos: en fila (que se desplaza siguiendo el cursor)
 * o en cuadrícula. La rueda, el trackpad y el teclado siguen funcionando, y
 * si el sistema pide menos movimiento la fila no sigue al cursor.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import type { FichaDocumento } from "@docvault/indice";
import { CONFIANZA_MINIMA } from "./ocr";
import { Miniatura } from "./Miniatura";
import { cuandoVence, etapa, hoyIso } from "@docvault/core";

export const ESTADOS: Record<string, string> = {
  "listo": "Con texto",
  "sin texto": "Vacío",
  "pendiente de OCR": "Espera OCR",
  "formato no soportado": "Solo nombre",
  "error": "No se pudo leer",
};

export function dudoso(d: FichaDocumento): boolean {
  return d.estadoTexto === "listo" && d.confianza != null && d.confianza < CONFIANZA_MINIMA;
}

export function tamano(b?: number | null): string {
  if (b == null) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}

export function fecha(ms?: number | null): string {
  return ms ? new Date(ms).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" }) : "";
}

export function nombreDe(id: string): string {
  return id.split("/").at(-1) ?? id;
}

export function resaltar(f: string): ReactNode[] {
  return f.split(/(\u0002[^\u0003]*\u0003)/).map((p, i) =>
    p.startsWith("\u0002") ? <mark key={i}>{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>);
}

export interface Elemento { doc: FichaDocumento; fragmento?: string }

interface Props {
  raiz: FileSystemDirectoryHandle;
  elementos: Elemento[];
  vista: "fila" | "cuadricula";
  elegido: string | null;
  alElegir: (id: string) => void;
  etiqueta: string;
}

export function Documentos({ raiz, elementos, vista, elegido, alElegir, etiqueta }: Props) {
  const ref = useRef<HTMLUListElement>(null);
  useSeguirCursor(ref, vista === "fila");
  return (
    <ul ref={ref} className={`docs ${vista}`} aria-label={etiqueta} tabIndex={vista === "fila" ? 0 : undefined}>
      {elementos.map(({ doc, fragmento }) => (
        <li key={doc.id}>
          <button className={`tarjeta-doc${elegido === doc.id ? " elegida" : ""}`} onClick={() => alElegir(doc.id)} aria-label={`Ver ficha de ${nombreDe(doc.id)}`}>
            <Miniatura raiz={raiz} doc={doc} />
            <span className="cuerpo">
              <span className="nombre" title={nombreDe(doc.id)}>{nombreDe(doc.id)}</span>
              <span className="meta">
                {doc.carpeta ? `${doc.carpeta} · ` : ""}{(doc.tipo || "sin extensión").toUpperCase()} · {fecha(doc.modificado)}
              </span>
              <span className="pie">
                {doc.codigo && <span className="codigo">{doc.codigo}</span>}
                <ChipVence doc={doc} />
                {dudoso(doc) && <span className="revisar" title="El OCR no está seguro de esta lectura">Revisar lectura</span>}
                {doc.estadoTexto && doc.estadoTexto !== "listo" && <span className="estado-doc">{ESTADOS[doc.estadoTexto]}</span>}
              </span>
              {fragmento && <span className="fragmento">{resaltar(fragmento)}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** La clase de color según qué tan cerca está el vencimiento. */
export function claseEtapa(fecha: string, hoy: string): string {
  const e = etapa(fecha, hoy);
  return e === "vencido" ? "vencido" : e === "esta semana" ? "semana" : e === "este mes" ? "mes" : "lejos";
}

/** En la tarjeta: solo si venció, vence en 30 días o falta confirmar la fecha. */
function ChipVence({ doc }: { doc: FichaDocumento }) {
  if (doc.venceEstado === "por confirmar") return <span className="chip-vence confirmar">Confirmar fecha</span>;
  if (!doc.vence || doc.venceEstado === "sin vencimiento") return null;
  const hoy = hoyIso();
  if (etapa(doc.vence, hoy) === "más adelante") return null;
  return <span className={`chip-vence ${claseEtapa(doc.vence, hoy)}`}>{cuandoVence(doc.vence, hoy)}</span>;
}

/** La fila se desliza hacia el lado donde está el cursor, con un movimiento suave. */
function useSeguirCursor(ref: RefObject<HTMLElement | null>, activo: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !activo || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let objetivo: number | null = null;
    let cuadro = 0;
    const paso = () => {
      if (objetivo == null) { cuadro = 0; return; }
      const d = objetivo - el.scrollLeft;
      if (Math.abs(d) < 0.5) { el.scrollLeft = objetivo; objetivo = null; cuadro = 0; return; }
      el.scrollLeft += d * 0.12;
      cuadro = requestAnimationFrame(paso);
    };
    const mover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const r = el.getBoundingClientRect();
      // Los bordes (12 % a cada lado) llevan hasta el principio y el final.
      const t = Math.min(1, Math.max(0, ((e.clientX - r.left) / r.width - 0.12) / 0.76));
      objetivo = t * max;
      if (!cuadro) cuadro = requestAnimationFrame(paso);
    };
    // Si el usuario usa la rueda, el trackpad o el teclado, se le deja hacer.
    const soltar = () => { objetivo = null; };
    el.addEventListener("pointermove", mover);
    el.addEventListener("wheel", soltar, { passive: true });
    el.addEventListener("keydown", soltar);
    return () => {
      cancelAnimationFrame(cuadro);
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("wheel", soltar);
      el.removeEventListener("keydown", soltar);
    };
  }, [ref, activo]);
}
