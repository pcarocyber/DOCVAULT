# Banco de pruebas de la fase 0

Mide en tu computadora lo que puede romper el plan: OCR, sugerencia de carpeta,
resúmenes con Ollama, fechas de vencimiento, duplicados y búsqueda. Usa los
30 documentos de prueba (todos con datos inventados) y compara cada resultado
con su clave de respuestas. Al final abre un informe con la tabla del plan
técnico ya llena.

Todo corre en tu equipo. Lo único que se descarga de internet son los
programas (la primera vez) y el modelo de IA básica (unos 120 MB, una sola vez).
Ningún documento sale de tu computadora.

## Lo que necesitas (una sola vez)

1. **Node.js 20 o más nuevo.** Abre la app Terminal y escribe `node -v`.
   Si responde `v20` o un número mayor, ya lo tienes. Si no, descarga el
   instalador "LTS" de [nodejs.org](https://nodejs.org) y ábrelo.
2. **Ollama.** Descárgalo de [ollama.com](https://ollama.com), ábrelo y deja
   que aparezca la llama en la barra de menú de arriba.
3. **Google Chrome** (o Microsoft Edge). Si no tienes ninguno, el paso
   `npm run preparar` descarga un navegador de pruebas.
4. **El código.** En GitHub, abre el repositorio `docvault`, elige la rama
   del pull request, pulsa el botón verde **Code** y luego **Download ZIP**.
   Descomprime el ZIP donde quieras, por ejemplo en Documentos.
5. **Los documentos de prueba.** Descarga `documentos-prueba.zip` de los
   archivos del proyecto en Claude y ponlo, sin descomprimir, dentro de la
   carpeta `bench/datos` del código.

## Cómo correrlo

Abre Terminal, escribe `cd ` (con un espacio al final), arrastra la carpeta
del código a la ventana de Terminal y pulsa Enter. Luego escribe estos
comandos, uno por uno:

```
npm install
npm run preparar
npm run banco
npm run calificar
```

| Comando | Qué hace | Cuánto tarda (aprox.) |
| --- | --- | --- |
| `npm install` | Descarga los programas que usa el banco | 1 a 3 minutos, solo la primera vez |
| `npm run preparar` | Revisa que todo esté listo, descomprime los documentos y descarga los dos modelos de Ollama (unos 7 GB en total) | Depende de tu internet, solo la primera vez |
| `npm run banco` | Corre todas las pruebas y abre el informe | 5 a 20 minutos; lo más lento son los resúmenes |
| `npm run calificar` | Abre una página para poner nota de 1 a 5 a cada resumen | Lo que tardes en leer 20 resúmenes |

`npm run preparar` te dice qué falta, si falta algo. Puedes repetirlo cuantas
veces quieras.

Al calificar no se muestra qué modelo escribió cada resumen, para que la nota
no dependa de eso. Puedes cerrar y seguir otro día: lo calificado queda
guardado. Cuando terminas, el informe se actualiza solo.

## Cómo leer el informe

El informe se abre solo en el navegador. Está en `bench/resultados/informe.html`
(y una copia en texto en `informe.md`).

- **La primera tabla** es la del plan técnico. Cada fila dice qué se midió,
  el umbral, si **PASA**, **NO PASA** o está **PENDIENTE**, y la decisión que
  corresponde.
- **PENDIENTE** quiere decir que falta un paso. Casi siempre es calificar los
  resúmenes (`npm run calificar`) o que Ollama no estaba abierto.
- **Las tres decisiones** debajo de la tabla son las que buscamos en la fase 0:
  qué OCR usar, qué nivel de IA es el predeterminado y qué tan buena es la
  carpeta que sugiere la app.
- **El detalle** muestra cada documento: cuántas palabras leyó bien el OCR,
  qué fecha de vencimiento encontró, qué carpeta sugirió y cada búsqueda.

Cada corrida se guarda en su propia carpeta dentro de `bench/resultados`
(por fecha y hora), así puedes comparar corridas.

## Qué se mide y cómo

| Prueba | Archivo | Cómo se mide |
| --- | --- | --- |
| OCR | `pruebas/ocr.ts` | Tesseract.js en Chrome lee las 14 fotos y escaneos. Se cuentan las palabras bien leídas contra el texto exacto y los segundos por página. Los PDF digitales se leen sin OCR. |
| Sugerencia de carpeta | `pruebas/carpeta.ts` | Un modelo pequeño de IA (multilingual-e5-small, en el navegador) compara cada documento con las 8 carpetas de ejemplo. Se mide cuántas veces la primera sugerencia es la correcta, solo con el nombre de la carpeta y con nombre y una descripción corta. |
| Resumen con Ollama | `pruebas/resumen.ts` | Cada modelo resume los 10 PDF digitales y da 3 recomendaciones. Se mide el tiempo y la memoria; la calidad la pones tú. |
| Fechas | `pruebas/fechas.ts` | Se busca la fecha de vencimiento en el texto leído y se compara con la clave, incluidas las 4 ambiguas como 03/04/2027. |
| Duplicados | `pruebas/duplicados.ts` | Se compara cada par de documentos; deben salir los 4 pares de la clave y ningún otro. |
| Índice y búsqueda | `pruebas/indice.ts` | SQLite con FTS5 en el navegador: se indexan 1.000 documentos (los 30 más 970 de relleno) y se hacen 32 búsquedas. |

Los umbrales están en `umbrales.json` y la configuración (modelos de Ollama,
carpetas de ejemplo, documentos a resumir) en `config.json`. Se pueden
cambiar sin tocar el código.

## Opciones

- `npm run banco -- --sin-ollama` corre todo menos los resúmenes (rápido).
- `npm run banco -- --visible` muestra la ventana de Chrome mientras trabaja.
- `npm run informe` vuelve a armar el informe de la última corrida.
- `npm test` corre las pruebas unitarias del código.

## Si algo falla

- **"No encuentro los documentos de prueba"**: falta `documentos-prueba.zip`
  en `bench/datos`. Ponlo ahí y ejecuta `npm run preparar`.
- **"Ollama no responde"**: abre la app Ollama y espera a ver la llama en la
  barra de menú.
- **La sugerencia de carpeta dice "No se pudo medir"**: el modelo de IA no se
  pudo descargar. Revisa tu internet y vuelve a correr `npm run banco`. Si
  necesitas trabajar sin internet, pon el modelo en
  `bench/modelos/Xenova/multilingual-e5-small/` y el banco lo usa sin descargar.

## Suposiciones del banco

- **Escaneos limpios** son los documentos con defecto `limpio` o `buena luz`
  en la clave (prueba_11, prueba_12 y prueba_17). El umbral de 90% de palabras
  correctas del plan se mide sobre esos; el resto se informa aparte.
- **Modelos de Ollama**: `llama3.2:3b` como modelo de 3B y `llama3.1:8b` como
  modelo de 8B. Se pueden cambiar en `config.json`.
- **Sugerencia de carpeta**: al crear una carpeta, el usuario escribe también una
  descripción corta (decisión de Pedro, 21 de noviembre de 2026). Por eso la
  decisión se toma con el modo "nombre y descripción". El modo "solo nombre"
  se sigue informando para comparar.
- **Tiempo por página del OCR**: no incluye la carga inicial del OCR, que se
  informa aparte. En los PDF escaneados sí incluye convertir la página en imagen.
- **Índice**: en la fase 0 la base de datos vive en memoria. Guardarla en el
  disco del navegador (OPFS) llega en la fase 1.
- **Fechas**: se toma como vencimiento la fecha que sigue a palabras como
  "vence", "válido hasta", "expires" o "due date". Fechas pedidas de otra
  forma (por ejemplo "devuelva esta carta firmada antes del…") no se detectan.

## Regenerar los documentos

`generador/` tiene el script en Python que creó los 30 documentos y su clave
(`python3 generar.py <carpeta>`). Necesita reportlab, Pillow, numpy y pdftoppm,
y las fuentes Liberation en la ruta de Linux. No hace falta para correr el banco.
