# DOCVAULT

Bóveda de documentos gratuita que corre en el navegador (Chrome y Edge) y
organiza una carpeta local del usuario. Todo es local por defecto, incluida la IA.

Estado: **fase 0 terminada** (ver docs/decisiones/0004). Todavía no hay app; hay un banco de
pruebas que mide OCR, IA local, fechas, duplicados y búsqueda en un equipo real.

**Para correr el banco de pruebas, sigue [bench/LEEME.md](bench/LEEME.md).**

## Estructura

```
apps/web/            la app (React + Vite, PWA); empieza en la fase 1
packages/core/       lógica sin pantalla: extraer texto, OCR, embeddings,
                     fechas, duplicados, sugerencia de carpeta, resumen con Ollama
packages/indice/     SQLite en WebAssembly + FTS5: esquema y búsqueda
packages/cifrado/    llega en la fase 2
bench/               banco de pruebas de la fase 0
  datos/             los 30 documentos (fuera de git)
  generador/         el script que crea los documentos y la clave
  pruebas/           ocr, carpeta, resumen, fechas, duplicados, indice
  calificar/         página para calificar los resúmenes de 1 a 5
  resultados/        una carpeta por corrida + informe.md con la tabla
docs/decisiones/     una nota corta por cada decisión técnica
```

El banco usa el mismo código (`packages/core` y `packages/indice`) que después
usará la app, así que lo que se escribe en la fase 0 no se tira.

## Para programadores

- Node.js 20 o más nuevo. `npm install` instala todo (workspaces de npm).
- `npm test` corre las pruebas unitarias (Vitest); `npm run typecheck` revisa los tipos.
- El plan técnico aprobado está en el documento "DOCVAULT: plan técnico" del proyecto.
