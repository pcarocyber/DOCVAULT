# DOCVAULT

Bóveda de documentos gratuita que corre en el navegador (Chrome y Edge) y
organiza una carpeta local del usuario. Todo es local por defecto, incluida la IA.

Estado: **fase 1, entrega 1**. La app ya abre una carpeta de tu computadora, lee el texto
de PDF y archivos de texto, y busca en nombres y contenido. Las fotos y escaneos todavía
no se leen (eso es el OCR de la próxima entrega).

## Para usar la app

1. Instala Node.js 20 o más nuevo (una sola vez).
2. En la Terminal, dentro de la carpeta `docvault`: `npm install` (una sola vez, o después
   de bajar cambios nuevos).
3. `npm run app`. Se abre Chrome en http://localhost:5180.
4. Pulsa **Elegir carpeta** y escoge la carpeta con tus documentos. Chrome pedirá permiso
   para ver los archivos. La app **solo lee**: no mueve, cambia ni borra nada.
5. Escribe en el buscador. No importan acentos ni mayúsculas.

El índice se guarda dentro de Chrome, en tu computadora; no sale a internet. Si agregas o
quitas archivos, pulsa **Actualizar**. Para cerrar la app, pulsa Ctrl+C en la Terminal.

Para el banco de pruebas de la fase 0, sigue [bench/LEEME.md](bench/LEEME.md).

## Estructura

```
apps/web/            la app (React + Vite, PWA)
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
- `npm run e2e` construye la app y la prueba de punta a punta en Chromium con una carpeta falsa.
- El plan técnico aprobado está en el documento "DOCVAULT: plan técnico" del proyecto.
