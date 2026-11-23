# 0001 · Un solo repositorio con paquetes compartidos

Fecha: 21 de noviembre de 2026 · Estado: aprobada por el dueño

**Decisión.** Un repositorio privado `docvault` con workspaces de npm:
`apps/web`, `packages/core`, `packages/indice`, `packages/cifrado` y `bench`.

**Por qué.** El banco de pruebas de la fase 0 usa el mismo código que usará la
app, así que lo que se mide es lo que se va a entregar y nada se tira.

**Consecuencia.** `packages/core` se divide en lógica pura (corre en Node y en
el navegador, con pruebas unitarias) y `navegador.ts` (pdf.js, Tesseract.js y
Transformers.js, que necesitan el navegador).
