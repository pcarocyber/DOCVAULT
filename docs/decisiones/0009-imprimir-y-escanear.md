# 0009 · Imprimir el código en el documento y escanearlo (entrega 5)

Fecha: 2026-11-26 · Aprobado por Pedro (el celular queda para la fase 2).

## Qué hace

- **Descargar o imprimir con código.** En la ficha, «Descargar con código» e «Imprimir con código»
  crean un PDF nuevo con una franja al pie de la primera página: QR, código de barras (Code 128)
  y el código escrito (DV-000123). El archivo original de la carpeta no cambia.
  - PDF: la primera página se alarga hacia abajo 90 pt (unos 3,2 cm). Así la franja **nunca tapa**
    el contenido. Las demás páginas llevan una línea pequeña «DV-000123 · página n de m».
  - Fotos y escaneos (JPG, PNG, WebP, GIF, BMP): se ponen en una hoja carta con la franja.
  - Word, Excel y otros: no se pueden estampar sin convertirlos; se ofrece solo la etiqueta.
  - Nada se dibuja en los 22 pt (≈ 8 mm) del borde, que muchas impresoras no imprimen.
- **Etiqueta.** «Imprimir etiqueta» crea un PDF de 7 × 3 cm con QR, barras, código y nombre,
  para pegar en un documento en papel que no pasó por la app.
- **Escanear.** El botón «Escanear» abre la cámara de la computadora. Al leer un código de la
  bóveda, abre su ficha y su carpeta. Usa el lector de códigos de Chrome (BarcodeDetector:
  QR y Code 128, disponible en Mac); si no existe, jsQR (solo QR). La imagen no se guarda.
- **Lector USB.** Un lector de código de barras "escribe" el código muy rápido y pulsa Enter.
  Si eso pasa en cualquier parte de la app (fuera de un campo de texto), se abre el documento.
  En el buscador, Enter con un código exacto también lo abre.

## Decisiones

- **El QR solo lleva «DV-000123»**, no un enlace. Funciona sin internet y no expone nada.
  Escanearlo con el celular (fase 2) necesitará cuentas y sincronización.
- **pdf-lib 1.17.1** para escribir PDF en el navegador (sin servidor). **jsqr 1.4.0** como
  respaldo del lector de QR. Versiones fijas.
- La franja **alarga** la página en vez de achicar el contenido: no cambia el tamaño de lo escrito.
  Al imprimir en carta con «ajustar a la página», Chrome reduce todo un poco (≈ 10 %).
- Nombres de descarga sin acentos (`arrendamiento local DV-000001.pdf`): algunos Chrome cambian
  por "download" un nombre fuera del ASCII.

## Pruebas

`npm run e2e` descarga con código un PDF y una foto, comprueba el tamaño de la página y lee el QR
del PDF (pdftoppm + jsQR); revisa la etiqueta; simula un lector USB; y simula la cámara con un
video que muestra un QR (primero uno ajeno, luego uno de la bóveda).
