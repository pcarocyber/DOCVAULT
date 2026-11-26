# 0008 · Vencimientos y duplicados

Fecha: 26 de noviembre de 2026 · Entrega 4 de la fase 1 (aprobada por el dueño con el plan).

## Vencimientos

- **Detección**: la regla medida en la fase 0 (`packages/core/src/fechas.ts`): solo una fecha
  que sigue a una palabra de vencimiento ("vence", "válido hasta", "expires"…), en la misma
  línea; si hay varias, la más lejana. El idioma del documento decide cómo leer 03/04/2027.
  Se busca al leer cada documento y, en fotos y escaneos, al terminar su OCR.
- **Estados**: `detectada`, `por confirmar` (fecha que se lee de dos formas), `no detectada`,
  y tres que decide el usuario: `confirmada`, `manual` y `sin vencimiento`. Lo que decide el
  usuario no se pisa aunque la app vuelva a leer el documento.
- **Dónde vive**: en el índice (versión 5: columnas `vence`, `vence_estado`, `vence_texto`,
  `vence_otra`) y, para lo que decide el usuario, también en `.docvault/vencimientos.json`
  dentro de su carpeta, por código (DV-000123). Así sobrevive si Chrome borra el índice o si
  el archivo cambia de nombre. Guardar una decisión pide permiso de escritura la primera vez.
- **Avisos**: en la portada, lo vencido y lo que vence en los próximos 30 días, más las
  fechas por confirmar. Con "Activar avisos", notificaciones del navegador: una por documento
  y por etapa (este mes, esta semana, vencido), agrupadas si son varias. **Solo salen con la
  app abierta**: no hay servidor que las mande con la app cerrada (eso llega con las cuentas,
  fase 2). Con la app abierta, se revisa cada hora.
- **Excel**: columnas "Vence" y "Origen de la fecha".

## Duplicados

- **Exactos**: mismo SHA-256 de los bytes. El índice guarda el hash de cada archivo (los
  índices anteriores lo completan en la primera actualización, leyendo cada archivo una vez).
- **Parecidos**: Jaccard de trozos de 5 letras, con los umbrales de la fase 0: 0,5 o más es
  "parecido" (puede ser una versión), 0,9 o más es "casi idéntico" (el mismo papel escaneado
  otra vez). Textos de menos de 80 letras no se comparan.
- **Al subir**: cada archivo se compara con la bóveda y con los demás de la misma subida.
  Una copia exacta queda sin marcar para guardar (se puede marcar); un parecido se guarda
  pero con el aviso a la vista y un enlace a la ficha del otro.
- **En la bóveda**: la portada lista los pares encontrados. Para no comparar cada par a fondo
  con miles de documentos, primero se usa una firma corta (MinHash de 64 valores) y solo los
  pares con firma parecida (desde 0,35) se miden con Jaccard. 1000 documentos: ~0,6 s la
  primera vez y ~0,1 s después (las firmas quedan en memoria mientras la app está abierta).
- "No son duplicados" guarda el par (por código) en los ajustes del índice.

## Qué queda para después

- Historial de versiones: fase 3. Hoy la app solo avisa que algo "puede ser una versión".
- Avisos con la app cerrada: fase 2, con cuentas.
