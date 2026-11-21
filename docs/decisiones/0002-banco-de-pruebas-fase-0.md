# 0002 · Cómo mide el banco de pruebas de la fase 0

Fecha: 21 de noviembre de 2026 · Estado: propuesta, en revisión

**Decisión.** El banco abre Chrome con Playwright en el equipo del dueño y corre
el código real de `packages/core` y `packages/indice` sobre los 30 documentos de
prueba. Ollama se mide desde Node por su conexión local. Los resultados se comparan
con la clave de respuestas y se escribe un informe con la tabla del plan técnico.

**Detalles que importan.**

- Los motores (Tesseract, sus idiomas y onnxruntime) se sirven desde
  `node_modules`, no desde servidores externos. Solo el modelo de embeddings
  se descarga de Hugging Face la primera vez y queda en caché.
- El banco usa su propio perfil de navegador (`bench/.navegador`) para que esa
  caché dure entre corridas.
- Las fechas, los duplicados y la puntuación corren en Node con las mismas
  funciones puras de `packages/core`.
- Los resúmenes se califican a ciegas: la página no dice qué modelo los escribió.

**Pendiente de decidir con los números del equipo del dueño:** qué OCR usar, qué
nivel de IA es el predeterminado y si la carpeta sugerida se preselecciona.
