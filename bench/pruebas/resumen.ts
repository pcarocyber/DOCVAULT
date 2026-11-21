/** Prueba de resumen y recomendaciones con Ollama: tiempos, memoria y textos para calificar. */
import { resumirConOllama } from "@docvault/core";
import type { MedicionOllama, Resumen } from "../lib/tipos";

export const URL_OLLAMA = "http://127.0.0.1:11434";

export async function modelosInstalados(): Promise<string[] | null> {
  try {
    const r = await fetch(`${URL_OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const j = await r.json() as { models: { name: string }[] };
    return j.models.map((m) => m.name);
  } catch {
    return null;
  }
}

export function estaInstalado(instalados: string[], modelo: string): boolean {
  const conEtiqueta = modelo.includes(":") ? modelo : `${modelo}:latest`;
  return instalados.includes(modelo) || instalados.includes(conEtiqueta);
}

async function memoriaGB(modelo: string): Promise<number | undefined> {
  try {
    const j = await (await fetch(`${URL_OLLAMA}/api/ps`)).json() as { models: { name: string; model: string; size: number }[] };
    const m = j.models.find((x) => x.name === modelo || x.model === modelo || x.name === `${modelo}:latest`);
    return m ? m.size / 1024 ** 3 : undefined;
  } catch { return undefined; }
}

async function descargarDeMemoria(modelo: string) {
  try {
    await fetch(`${URL_OLLAMA}/api/generate`, { method: "POST", body: JSON.stringify({ model: modelo, keep_alive: 0 }) });
  } catch { /* nada */ }
}

export async function medirOllama(
  modelos: string[], textos: { archivo: string; texto: string }[], avisar: (m: string) => void,
): Promise<MedicionOllama> {
  const instalados = await modelosInstalados();
  if (!instalados) {
    return { disponible: false, error: "Ollama no está abierto en este equipo", modelos: modelos.map((modelo) => ({ modelo, instalado: false })), resumenes: [] };
  }
  const salida: MedicionOllama = { disponible: true, modelos: [], resumenes: [] };
  for (const modelo of modelos) {
    if (!estaInstalado(instalados, modelo)) {
      avisar(`  ${modelo}: no está instalado (ejecuta npm run preparar). Lo salto.`);
      salida.modelos.push({ modelo, instalado: false });
      continue;
    }
    // Se mide cada modelo solo, sin otro modelo ocupando memoria.
    for (const otro of modelos) if (otro !== modelo) await descargarDeMemoria(otro);
    avisar(`  ${modelo}: cargando el modelo…`);
    const t0 = Date.now();
    await fetch(`${URL_OLLAMA}/api/generate`, { method: "POST", body: JSON.stringify({ model: modelo, prompt: "Hola", stream: false, options: { num_predict: 1 } }) });
    const segundosCarga = (Date.now() - t0) / 1000;
    const memoria = await memoriaGB(modelo);
    salida.modelos.push({ modelo, instalado: true, segundosCarga, memoriaGB: memoria });
    for (const [i, d] of textos.entries()) {
      avisar(`  ${modelo}: resumen ${i + 1} de ${textos.length} (${d.archivo})`);
      const id = `${modelo}|${d.archivo}`;
      try {
        const r = await resumirConOllama(d.texto, modelo, URL_OLLAMA);
        const res: Resumen = { id, modelo, archivo: d.archivo, texto: r.texto, segundos: r.segundos, segundosCarga: r.segundosCarga, tokensPorSegundo: r.tokensPorSegundo };
        salida.resumenes.push(res);
        avisar(`    ${r.segundos.toFixed(1)} s`);
      } catch (e) {
        salida.resumenes.push({ id, modelo, archivo: d.archivo, texto: "", segundos: NaN, segundosCarga: 0, tokensPorSegundo: 0, error: String(e) });
      }
    }
    const final = salida.modelos.at(-1)!;
    final.memoriaGB = (await memoriaGB(modelo)) ?? final.memoriaGB;
    await descargarDeMemoria(modelo);
  }
  return salida;
}
