/**
 * Avisos de vencimiento con las notificaciones del navegador. Solo salen mientras
 * la app está abierta (no hay servidor que las mande con la app cerrada). Cada
 * documento avisa una vez por etapa: este mes, esta semana y vencido.
 */
import type { FichaDocumento, Indice } from "@docvault/indice";
import { cuandoVence, etapa, fechaCorta, hoyIso } from "@docvault/core";

export type PermisoAvisos = "activos" | "sin decidir" | "bloqueados" | "no disponible";

export function permisoAvisos(): PermisoAvisos {
  if (typeof Notification === "undefined") return "no disponible";
  return Notification.permission === "granted" ? "activos" : Notification.permission === "denied" ? "bloqueados" : "sin decidir";
}

export async function activarAvisos(): Promise<PermisoAvisos> {
  if (typeof Notification === "undefined") return "no disponible";
  await Notification.requestPermission();
  return permisoAvisos();
}

/** Documentos con fecha que ya venció o vence en los próximos 30 días. */
export function porVencer(docs: FichaDocumento[], hoy = hoyIso()): FichaDocumento[] {
  return docs
    .filter((d) => d.vence && d.venceEstado !== "sin vencimiento" && etapa(d.vence, hoy) !== "más adelante")
    .sort((a, b) => a.vence!.localeCompare(b.vence!));
}

const nombre = (id: string) => id.split("/").at(-1) ?? id;

/** Muestra las notificaciones que falten. Devuelve cuántos documentos avisó. */
export function avisarVencimientos(indice: Indice, docs: FichaDocumento[], alAbrir: (id: string) => void, hoy = hoyIso()): number {
  if (permisoAvisos() !== "activos") return 0;
  const nuevos = porVencer(docs, hoy).filter((d) => indice.ajuste(`avisado:${d.id}`) !== `${d.vence}|${etapa(d.vence!, hoy)}`);
  if (nuevos.length === 0) return 0;
  for (const d of nuevos) indice.ponerAjuste(`avisado:${d.id}`, `${d.vence}|${etapa(d.vence!, hoy)}`);
  const opciones = { icon: "/icono-192.png", tag: "docvault-vencimientos" };
  const n = nuevos.length === 1
    ? new Notification(`${nombre(nuevos[0].id)} ${cuandoVence(nuevos[0].vence!, hoy)}`, {
        ...opciones, body: `${nuevos[0].codigo ?? ""} · ${fechaCorta(nuevos[0].vence!)}`.replace(/^ · /, ""),
      })
    : new Notification(`${nuevos.length} documentos vencidos o por vencer`, {
        ...opciones, body: nuevos.slice(0, 4).map((d) => `${nombre(d.id)}: ${cuandoVence(d.vence!, hoy)}`).join("\n") + (nuevos.length > 4 ? "\n…" : ""),
      });
  n.onclick = () => { window.focus(); if (nuevos.length === 1) alAbrir(nuevos[0].id); n.close(); };
  return nuevos.length;
}
