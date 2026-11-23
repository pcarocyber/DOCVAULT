# 0007 · Código único por documento y nuevo diseño

Fecha: 23 de noviembre de 2026 · Aprobado por el dueño (entrega 3 de la fase 1).

## Qué se decidió

- **Código**: cada documento recibe `DV-` y seis dígitos (DV-000001, DV-000002…), en el
  orden en que la app lo encuentra. Los números **no se reutilizan**: si se borra un
  documento, su número queda retirado.
- **Dónde vive**: en el índice (columna `codigo`, única) y, cuando ya hay permiso de
  escritura, en `.docvault/codigos.json` dentro de la carpeta del usuario. Si Chrome borra
  el índice, al reconstruirlo cada ruta recupera su código de ese archivo.
- **Archivos movidos o renombrados fuera de la app**: si desaparece un archivo y aparece
  otro con el mismo tamaño y fecha de modificación (o, si no, el mismo nombre y tamaño), se
  trata como el mismo y conserva el código. Solo cuando hay un único candidato, para no
  confundir copias.
- **QR y código de barras**: el QR (qrcode-generator, nivel M) y el Code 128-B (código
  propio en `packages/core/src/codigos.ts`) llevan solo el texto `DV-000123`. Así un lector
  USB o la cámara lo escriben en el buscador. Cuando existan las cuentas (fase 2), el QR
  llevará el enlace para abrirlo desde el celular.
- **Buscar por código**: el buscador reconoce `DV-000123`, `dv 123`, `DV000123` y seis
  dígitos exactos; ese documento sale primero y Enter abre su ficha. La dirección
  `#DV-000123` abre la ficha directamente.
- **Diseño**: carpetas como tarjetas; al abrir una, sus documentos en una fila con
  miniaturas que se desplaza hacia el cursor (con rueda, trackpad y teclado también; sin
  movimiento si el sistema pide reducirlo). Vista de cuadrícula opcional. Ficha lateral con
  datos, QR, código de barras y acciones. Sin fuentes externas: nada se pide a internet.
- **Excel**: «Exportar a Excel» crea en el navegador un .xlsx con código, nombre, carpeta,
  ruta, tipo, tamaño, fecha, estado del texto y confianza del OCR.

## Qué queda para después

- Estampar el código en la copia descargada o impresa, y escanear con la cámara de la
  computadora o un lector USB: entrega 5.
- Abrir el documento escaneando con el celular: fase 2 (necesita cuentas y sincronización).
