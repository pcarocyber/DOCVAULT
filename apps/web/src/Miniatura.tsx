/**
 * Miniatura de un documento: la foto misma, o la primera página del PDF.
 * Se hacen de una en una y solo cuando la tarjeta se ve, y se guardan en
 * memoria mientras la app está abierta. Para lo demás, un ícono con el tipo.
 */
import { useEffect, useRef, useState } from "react";
import type { FichaDocumento } from "@docvault/indice";
import { pdfAImagenes } from "@docvault/core/navegador";
import { archivoPorRuta } from "./carpeta";

const IMAGENES = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp"]);
const MAX_BYTES = 25 * 1024 ** 2;
const cache = new Map<string, Promise<string | null>>();
let cola: Promise<unknown> = Promise.resolve();

function hacer(raiz: FileSystemDirectoryHandle, d: FichaDocumento): Promise<string | null> {
  const clave = `${d.id}|${d.modificado}`;
  let p = cache.get(clave);
  if (!p) {
    p = cola.then(async () => {
      const f = await archivoPorRuta(raiz, d.id);
      if (f.size > MAX_BYTES) return null;
      if (IMAGENES.has(d.tipo ?? "")) {
        const bmp = await createImageBitmap(f, { resizeWidth: 360, resizeQuality: "medium" });
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        c.getContext("2d")!.drawImage(bmp, 0, 0);
        bmp.close();
        return URL.createObjectURL(await c.convertToBlob({ type: "image/jpeg", quality: 0.8 }));
      }
      if (d.tipo === "pdf") {
        const [img] = await pdfAImagenes(new Uint8Array(await f.arrayBuffer()), 0.6, 1);
        return img ? URL.createObjectURL(img) : null;
      }
      return null;
    }).catch(() => null);
    cola = p;
    cache.set(clave, p);
  }
  return p;
}

export function puedeTenerMiniatura(d: FichaDocumento): boolean {
  return d.tipo === "pdf" || IMAGENES.has(d.tipo ?? "");
}

export function Miniatura({ raiz, doc }: { raiz: FileSystemDirectoryHandle; doc: FichaDocumento }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const tipo = (doc.tipo || "archivo").toUpperCase();

  useEffect(() => {
    if (!puedeTenerMiniatura(doc) || !ref.current) return;
    let vivo = true;
    const obs = new IntersectionObserver((e) => {
      if (!e.some((x) => x.isIntersecting)) return;
      obs.disconnect();
      void hacer(raiz, doc).then((u) => { if (vivo) setUrl(u); });
    }, { rootMargin: "200px" });
    obs.observe(ref.current);
    return () => { vivo = false; obs.disconnect(); };
  }, [raiz, doc]);

  return (
    <div ref={ref} className={`miniatura tipo-${doc.tipo || "otro"}`} aria-hidden="true">
      {url ? <img src={url} alt="" draggable={false} /> : <span className="icono-tipo">{tipo.slice(0, 4)}</span>}
    </div>
  );
}
