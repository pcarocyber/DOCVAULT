import csv, json, math, os, random, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

sys.path.insert(0, os.path.dirname(__file__))
from contenido import DOCS, PIE_ES, PIE_EN

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
TXT = os.path.join(OUT, "respuestas", "texto")
os.makedirs(TXT, exist_ok=True)
random.seed(7); np.random.seed(7)

pdfmetrics.registerFont(TTFont("Lib", "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"))
pdfmetrics.registerFont(TTFont("LibB", "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Sans", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"))
pdfmetrics.registerFont(TTFont("SansB", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"))

def styles(i):
    serif = i % 2 == 0
    f, fb = ("Lib", "LibB") if serif else ("Sans", "SansB")
    return (ParagraphStyle("t", fontName=fb, fontSize=15, leading=19, spaceAfter=10, alignment=1),
            ParagraphStyle("b", fontName=f, fontSize=10.5, leading=14.5, spaceAfter=7),
            ParagraphStyle("p", fontName=f, fontSize=8, leading=10, textColor=colors.grey), f, fb)

def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def texto_plano(d):
    lines = [d["titulo"], ""]
    lines += [f"{k}: {v}" for k, v in d["campos"]]
    if d.get("tabla"):
        lines.append("")
        lines += [" | ".join(c for c in r if c) for r in d["tabla"]]
    lines.append("")
    lines += d["parrafos"]
    if d["firmas"]:
        lines.append("")
        lines += d["firmas"]
    lines += ["", PIE_ES if d["idioma"] == "es" else PIE_EN]
    return "\n".join(lines) + "\n"

def render_pdf(d, path, n):
    st, sb, sp, f, fb = styles(n)
    story = [Paragraph(esc(d["titulo"]), st), Spacer(1, 4)]
    for k, v in d["campos"]:
        story.append(Paragraph(f"<font name='{fb}'>{esc(k)}:</font> {esc(v)}", sb))
    if d.get("tabla"):
        story.append(Spacer(1, 6))
        t = Table(d["tabla"], hAlign="LEFT")
        t.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), f, 9.5), ("FONT", (0, 0), (-1, 0), fb, 9.5),
                               ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.black),
                               ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                               ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        story += [t, Spacer(1, 8)]
    story.append(Spacer(1, 4))
    for p in d["parrafos"]:
        story.append(Paragraph(esc(p), sb))
    if d["firmas"]:
        story.append(Spacer(1, 26))
        for s in d["firmas"]:
            story += [Paragraph("_______________________________", sb), Paragraph(esc(s), sb), Spacer(1, 10)]
    story += [Spacer(1, 18), Paragraph(esc(PIE_ES if d["idioma"] == "es" else PIE_EN), sp)]
    SimpleDocTemplate(path, pagesize=letter, leftMargin=2.3 * cm, rightMargin=2.3 * cm,
                      topMargin=2 * cm, bottomMargin=2 * cm, title=d["titulo"]).build(story)

def pdf_a_imagen(pdf, dpi=150):
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(["pdftoppm", "-r", str(dpi), "-png", "-singlefile", pdf, os.path.join(td, "p")], check=True)
        return Image.open(os.path.join(td, "p.png")).convert("RGB")

# ---------- defectos ----------
def ruido(img, s):
    a = np.asarray(img).astype(np.float32)
    a += np.random.normal(0, s, a.shape)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def iluminacion(img, minimo, maximo, angulo=0.0, tinte=(1, 1, 1)):
    w, h = img.size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    g = (xx / w) * math.cos(angulo) + (yy / h) * math.sin(angulo)
    g = (g - g.min()) / (g.max() - g.min() + 1e-6)
    m = minimo + (maximo - minimo) * g
    a = np.asarray(img).astype(np.float32) * m[..., None] * np.array(tinte, dtype=np.float32)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def sombra(img):
    w, h = img.size
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).polygon([(w * 0.55, 0), (w, 0), (w, h), (w * 0.25, h)], fill=120)
    mask = mask.filter(ImageFilter.GaussianBlur(w * 0.04))
    dark = Image.new("RGB", img.size, (30, 30, 40))
    return Image.composite(dark, img, mask)

def coef_perspectiva(dst, src):
    A, B = [], []
    for (x, y), (u, v) in zip(dst, src):
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
        B += [u, v]
    return np.linalg.solve(np.array(A, float), np.array(B, float)).tolist()

def foto(img, inclinacion=0.0, fondo=(96, 72, 52)):
    """Coloca la hoja sobre una mesa con perspectiva leve, como una foto de celular."""
    w, h = img.size
    W, H = int(w * 1.25), int(h * 1.2)
    base = Image.new("RGB", (W, H), fondo)
    base = ruido(base, 10).filter(ImageFilter.GaussianBlur(1.2))
    j = lambda s: random.uniform(-s, s) * w
    ox, oy = (W - w) / 2, (H - h) / 2
    dst = [(ox + j(.03), oy + j(.02)), (ox + w + j(.03), oy + j(.03)),
           (ox + w + j(.02), oy + h + j(.02)), (ox + j(.04), oy + h + j(.02))]
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    hoja = img.transform((W, H), Image.PERSPECTIVE, coef_perspectiva(dst, src), Image.BICUBIC, fillcolor=None)
    mask = Image.new("L", (w, h), 255).transform((W, H), Image.PERSPECTIVE, coef_perspectiva(dst, src), Image.BICUBIC)
    base.paste(hoja, (0, 0), mask)
    if inclinacion:
        base = base.rotate(inclinacion, resample=Image.BICUBIC, expand=False, fillcolor=fondo)
    return base

def sello(img, texto, color=(30, 60, 170)):
    w, h = img.size
    r = int(w * 0.13)
    capa = Image.new("RGBA", (2 * r + 20, 2 * r + 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    c = r + 10
    d.ellipse([10, 10, 10 + 2 * r, 10 + 2 * r], outline=color + (170,), width=max(4, r // 18))
    d.ellipse([10 + r * .18, 10 + r * .18, 10 + r * 1.82, 10 + r * 1.82], outline=color + (150,), width=max(2, r // 30))
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", max(14, r // 4))
    for k, line in enumerate(texto):
        tw = d.textlength(line, font=font)
        d.text((c - tw / 2, c - r * .35 + k * r * .35), line, font=font, fill=color + (170,))
    capa = capa.rotate(random.uniform(-25, 25), resample=Image.BICUBIC, expand=True)
    out = img.convert("RGBA")
    out.alpha_composite(capa, (int(w * 0.42), int(h * 0.15)))
    return out.convert("RGB")

def escaneo(img, angulo=0.6, ruido_s=6, escala=1.0):
    g = img.convert("L")
    if escala != 1.0:
        s = g.size
        g = g.resize((int(s[0] * escala), int(s[1] * escala)), Image.BILINEAR).resize(s, Image.NEAREST)
    g = g.rotate(angulo, resample=Image.BICUBIC, fillcolor=255)
    return ruido(g.convert("RGB"), ruido_s).convert("L")

def guardar_jpg(img, path, q=82):
    img.save(path, "JPEG", quality=q)

def guardar_pdf_imagen(img, path, dpi):
    img.save(path, "PDF", resolution=dpi)

# ---------- plan de archivos ----------
# (numero, id_contenido, tipo, defecto, duplicado_de, version_de)
PLAN = [(n, f"D{n:02d}", "digital", "ninguno", "", "") for n in range(1, 11)]
PLAN += [
    (11, "I11", "foto", "buena luz", "", ""),
    (12, "I12", "escaneo", "limpio", "", ""),
    (13, "I13", "foto", "torcida", "", ""),
    (14, "I14", "foto", "mala luz", "", ""),
    (15, "I15", "foto", "sello encima del texto", "", ""),
    (16, "I16", "foto", "sombra y desenfoque", "", ""),
    (17, "I17", "escaneo", "limpio", "", ""),
    (18, "I18", "foto", "torcida", "", ""),
    (19, "I19", "foto", "mala luz", "", ""),
    (20, "I20", "escaneo", "baja resolución", "", ""),
    (21, "I21", "escaneo", "sello encima del texto", "", ""),
    (22, "I22", "foto", "desenfocada", "", ""),
    (23, "A23", "digital", "fecha ambigua", "", ""),
    (24, "A24", "digital", "fecha ambigua", "", ""),
    (25, "A25", "digital", "fecha ambigua", "", ""),
    (26, "A26", "digital", "fecha ambigua", "", ""),
    (27, "I12", "escaneo", "segundo escaneo del mismo papel", "prueba_12", ""),
    (28, "I17", "foto", "foto del mismo papel escaneado", "prueba_17", ""),
    (29, "X29", "digital", "versión con cantidad corregida", "", "prueba_02"),
    (30, "X30", "digital", "versión con fecha de fin cambiada", "", "prueba_06"),
]

filas = []
with tempfile.TemporaryDirectory() as tmp:
    for n, cid, tipo, defecto, dup, ver in PLAN:
        d = DOCS[cid]
        nombre = f"prueba_{n:02d}"
        base_pdf = os.path.join(tmp, f"{cid}.pdf")
        if not os.path.exists(base_pdf):
            render_pdf(d, base_pdf, int(cid[1:]))
        if tipo == "digital":
            archivo = nombre + ".pdf"
            subprocess.run(["cp", base_pdf, os.path.join(OUT, archivo)], check=True)
        else:
            img = pdf_a_imagen(base_pdf, 150)
            sello_txt = ["RECIBIDO", "21 NOV 2026"] if d["idioma"] == "es" else ["RECEIVED", "NOV 21 2026"]
            if tipo == "foto":
                archivo = nombre + ".jpg"
                if defecto == "buena luz":
                    out = iluminacion(foto(img), 0.92, 1.02, 0.7, (1.0, 0.98, 0.93))
                elif defecto == "torcida":
                    out = iluminacion(foto(img, inclinacion=random.choice([-8, 7])), 0.85, 1.0, 1.2)
                elif defecto == "mala luz":
                    out = ruido(iluminacion(foto(img), 0.35, 0.75, 0.4, (1.0, 0.9, 0.7)), 14)
                elif defecto == "sello encima del texto":
                    out = iluminacion(foto(sello(img, sello_txt)), 0.85, 1.0, 0.9)
                elif defecto == "sombra y desenfoque":
                    out = sombra(foto(img)).filter(ImageFilter.GaussianBlur(1.6))
                elif defecto == "desenfocada":
                    out = foto(img).filter(ImageFilter.GaussianBlur(2.2))
                elif defecto == "foto del mismo papel escaneado":
                    out = iluminacion(foto(img, inclinacion=-3), 0.8, 1.0, 2.0, (1.0, 0.97, 0.9))
                out = ruido(out, 4)
                guardar_jpg(out, os.path.join(OUT, archivo))
            else:
                archivo = nombre + ".pdf"
                if defecto == "limpio":
                    out, dpi = escaneo(img, 0.5, 5), 150
                elif defecto == "baja resolución":
                    out, dpi = escaneo(img, -0.8, 8, escala=0.45), 150
                elif defecto == "sello encima del texto":
                    out, dpi = escaneo(sello(img, sello_txt), 0.9, 6), 150
                elif defecto == "segundo escaneo del mismo papel":
                    out, dpi = escaneo(img, -1.4, 9), 150
                guardar_pdf_imagen(out, os.path.join(OUT, archivo), dpi)
        with open(os.path.join(TXT, nombre + ".txt"), "w", encoding="utf-8") as fh:
            fh.write(texto_plano(d))
        filas.append({
            "archivo": archivo, "tipo": tipo, "defecto": defecto, "idioma": d["idioma"],
            "carpeta_correcta": d["categoria"], "titulo": d["titulo"],
            "vence": d.get("vence") or "", "fecha_como_aparece": d.get("fecha_escrita") or "",
            "fecha_ambigua": "sí" if d.get("ambigua") else "no", "otra_lectura_posible": d.get("otra_lectura", ""),
            "duplicado_de": dup, "version_de": ver, "texto_esperado": f"respuestas/texto/{nombre}.txt",
        })

with open(os.path.join(OUT, "respuestas", "clave.csv"), "w", newline="", encoding="utf-8-sig") as fh:
    w = csv.DictWriter(fh, fieldnames=list(filas[0].keys()))
    w.writeheader(); w.writerows(filas)
with open(os.path.join(OUT, "respuestas", "clave.json"), "w", encoding="utf-8") as fh:
    json.dump(filas, fh, ensure_ascii=False, indent=1)
print(len(filas), "archivos")
