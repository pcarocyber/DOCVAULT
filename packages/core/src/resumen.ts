/**
 * Resumen y recomendaciones con Ollama (IA local opcional).
 * Habla con Ollama por su conexión local (http://127.0.0.1:11434). Nada sale del equipo.
 */

export interface ResultadoResumen {
  modelo: string;
  texto: string;
  segundos: number;          // tiempo total de la respuesta
  segundosCarga: number;     // parte del tiempo usada en cargar el modelo
  tokensGenerados: number;
  tokensPorSegundo: number;
}

export function instruccionResumen(texto: string): string {
  return [
    "Eres un asistente para abogados, contadores y pequeñas empresas.",
    "Lee el documento y responde siempre en español, aunque el documento esté en inglés.",
    "Formato exacto:",
    "Resumen: 3 a 5 frases con las partes, el objeto, montos y fechas importantes.",
    "Recomendaciones: 3 puntos concretos para fortalecer el documento (cláusulas que faltan, datos incompletos o riesgos).",
    "No inventes datos que no estén en el documento.",
    "",
    "Documento:",
    '"""',
    texto.slice(0, 12000),
    '"""',
  ].join("\n");
}

export async function resumirConOllama(
  texto: string, modelo: string, url = "http://127.0.0.1:11434",
): Promise<ResultadoResumen> {
  const inicio = Date.now();
  const r = await fetch(`${url}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: modelo, prompt: instruccionResumen(texto), stream: false,
      options: { temperature: 0.2, num_ctx: 8192 },
    }),
  });
  if (!r.ok) throw new Error(`Ollama respondió ${r.status}: ${await r.text()}`);
  const j = await r.json() as {
    response: string; total_duration?: number; load_duration?: number; eval_count?: number; eval_duration?: number;
  };
  const ns = 1e9;
  return {
    modelo,
    texto: j.response.trim(),
    segundos: j.total_duration ? j.total_duration / ns : (Date.now() - inicio) / 1000,
    segundosCarga: (j.load_duration ?? 0) / ns,
    tokensGenerados: j.eval_count ?? 0,
    tokensPorSegundo: j.eval_count && j.eval_duration ? j.eval_count / (j.eval_duration / ns) : 0,
  };
}
