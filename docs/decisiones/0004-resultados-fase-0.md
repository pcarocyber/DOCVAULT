# 0004 · Resultados de la fase 0

Fecha: 22 de noviembre de 2026 · Estado: decidida por el dueño

Corrida del 21 de noviembre en el equipo de Pedro (Apple M3, 8 núcleos, 16 GB, macOS 14.5, Chrome 157). Las seis pruebas pasan.

| Qué | Medido | Decisión |
| --- | --- | --- |
| OCR | 0,7 s por página; 100% de palabras en escaneos limpios, 84% en todas las fotos | Tesseract.js |
| Sugerencia de carpeta | 93% con nombre y descripción (60% solo nombre) | Preseleccionada; el usuario confirma al subir |
| Resumen con Ollama | llama3.2:3b 9,5 s, 2,8 GB, calidad 3,4; llama3.1:8b 21,6 s, 5,4 GB, calidad 3,9 | llama3.2:3b predeterminado; 8B opcional con 16 GB |
| Fechas | 27 de 30; 4 de 4 ambiguas preguntadas | Confirmar solo las ambiguas |
| Duplicados | 4 de 4 pares, 0 falsos positivos | Umbral de similitud 0,5 |
| Búsqueda | 1.000 documentos en 137 ms; búsqueda máxima 1,7 ms | SQLite con FTS5 |

**Para la fase 1.** El modelo de 3B inventó datos en una factura y dio recomendaciones de contrato a un estado de cuenta: pedir recomendaciones solo para contratos y poderes, con instrucciones por tipo de documento. Los tiempos son optimistas para 8 GB y las reglas de fechas se escribieron con estos mismos documentos: ambos se vuelven a medir en la beta.
