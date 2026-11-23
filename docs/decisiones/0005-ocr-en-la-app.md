# 0005. OCR, Word y Excel en la app (fase 1, entrega 2)

Fecha: 2026-11-23

## Qué se hizo

- **OCR en cola.** Al terminar de indexar, la app lee una por una las fotos (jpg, png, tif,
  webp, bmp, gif) y los PDF sin texto. Tesseract.js corre en un worker, así que la app sigue
  respondiendo. Si se pulsa Actualizar o se cambia de carpeta, la cola se detiene después del
  documento en curso. El índice se guarda cada 5 documentos, así que lo leído no se pierde.
- **Archivos del OCR locales.** El worker, el núcleo WebAssembly y los idiomas español e inglés
  se sirven desde la propia app (`/motores/`), copiados de node_modules al construir. No se
  descarga nada de servidores externos.
- **Confianza.** Se guarda la confianza de cada lectura (de 0 a 1, ponderada por la cantidad de
  texto de cada página). Por debajo de 0,7 el documento se marca "Revisar lectura".
- **PDF escaneados:** se leen hasta 30 páginas por documento, a escala 2,5.
- **Word y Excel** (.docx y .xlsx) se leen descomprimiendo el ZIP con fflate y tomando el texto
  del XML. Los formatos viejos (.doc y .xls) y las fotos HEIC siguen solo por nombre.
- **Índice versión 3:** agrega la columna `confianza`. Un índice de la entrega 1 se actualiza
  solo, sin releer la carpeta.

## Supuestos (por confirmar)

- El plan pedía enderezar y limpiar la imagen antes del OCR. No se hizo todavía: primero se
  medirá con el banco de la fase 0 si hace falta, porque Tesseract ya binariza por su cuenta.
- El umbral de 0,7 y el límite de 30 páginas son estimaciones, no medidas.
- "Subir archivos", crear carpetas y aceptar la carpeta sugerida necesitan que la app pueda
  **escribir** en la carpeta del usuario. Hoy solo lee. Queda para cuando el dueño lo decida.
