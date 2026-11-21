# 0003 · Cada carpeta lleva una descripción corta

Fecha: 21 de noviembre de 2026 · Estado: decidida por el dueño

**Decisión.** Al crear una carpeta, el usuario escribe su nombre y una descripción
corta (por ejemplo, "Facturas: facturas, recibos y comprobantes de compra o pago").
La app usa las dos para sugerir la carpeta de cada documento nuevo.

**Por qué.** En la corrida de prueba del banco, con solo el nombre la primera
sugerencia acertó 60% de las veces; con nombre y descripción, 93%. El umbral del
plan es 80%.

**Consecuencia.** El banco decide con `modo_para_decidir: nombre_y_descripcion`
(`bench/umbrales.json`). La pantalla de crear carpeta de la fase 1 debe pedir la
descripción y proponer un ejemplo.
