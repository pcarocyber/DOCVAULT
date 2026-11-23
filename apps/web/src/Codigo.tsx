/**
 * El código QR y el código de barras (Code 128) de un documento, dibujados en SVG.
 * El QR lleva solo el código (DV-000123): cualquier lector lo escribe tal cual en
 * el buscador. Cuando haya cuentas (fase 2) llevará el enlace para abrirlo en el celular.
 */
import qrcode from "qrcode-generator";
import { code128 } from "@docvault/core";

export function QrSvg({ texto, tamano = 120 }: { texto: string; tamano?: number }) {
  const qr = qrcode(0, "M");
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      let largo = 1;
      while (c + largo < n && qr.isDark(r, c + largo)) largo++;
      d += `M${c} ${r}h${largo}v1h-${largo}z`;
      c += largo - 1;
    }
  }
  return (
    <svg className="qr" width={tamano} height={tamano} viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img"
      aria-label={`Código QR de ${texto}`} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fff" />
      <path fill="#14181f" d={d} />
    </svg>
  );
}

export function BarrasSvg({ texto, alto = 40 }: { texto: string; alto?: number }) {
  const { barras, ancho } = code128(texto);
  const d = barras.map((b) => `M${b.x} 0h${b.ancho}v${alto}h-${b.ancho}z`).join("");
  return (
    <svg className="barras" width={ancho * 1.4} height={(alto + 8) * 1.2} viewBox={`0 -4 ${ancho} ${alto + 8}`} role="img"
      aria-label={`Código de barras de ${texto}`} shapeRendering="crispEdges" preserveAspectRatio="none">
      <rect x={0} y={-4} width={ancho} height={alto + 8} fill="#fff" />
      <path fill="#14181f" d={d} />
    </svg>
  );
}
