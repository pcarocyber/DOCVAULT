# 0006. Subir archivos y carpetas con descripción (fase 1, entrega 2)

Fecha: 2026-11-23 · Estado: decidida por el dueño (permiso de escritura al usarlo)

## Qué se hizo

- **Permiso de escritura solo al usarlo.** La carpeta se sigue abriendo en modo lectura. Chrome
  pide permiso para escribir la primera vez que el usuario guarda un archivo subido, crea una
  carpeta o cambia una descripción.
- **Carpetas = subcarpetas de primer nivel** de la carpeta del usuario. La descripción de cada
  una se guarda en `.docvault/carpetas.json`, dentro de la propia carpeta, así no se pierde si
  se borra el índice del navegador. La app no indexa carpetas que empiezan con punto.
- **Subir:** el botón "Subir archivos" o arrastrar archivos a la ventana. La app lee cada archivo
  (con OCR si es foto o escaneo), sugiere la carpeta y la deja marcada como "(sugerida)". Nada se
  copia hasta pulsar Guardar. Si ya hay un archivo con ese nombre, agrega " (2)" en vez de
  reemplazarlo. Lo guardado entra al índice sin volver a leerlo.
- **Sugerencia:** el modelo multilingual-e5-small compara el texto del documento (el nombre del
  archivo solo si no hay texto) con "nombre: descripción" de cada carpeta, como en el banco.
  Las carpetas con descripción van primero.
- **El modelo** se usa desde `bench/modelos` si existe (lo deja el banco); si no, se baja una vez
  de Hugging Face (unos 120 MB) y Chrome lo guarda. Ningún documento sale del equipo.

## Supuestos y límites

- En la prueba, un recibo de alquiler se sugirió para "Contratos" en vez de "Facturas". Es un
  caso ambiguo; por eso el usuario siempre confirma.
- Las carpetas sin descripción solo compiten por nombre, que en el banco acertó 60 %.
