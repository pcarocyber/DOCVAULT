import type { Categoria } from "@docvault/core";

export interface Config {
  modelos_ollama: string[];
  documentos_resumen: string[];
  modelo_embeddings: string;
  categorias: Categoria[];
  ocr: { escala_pdf: number; minimo_caracteres_pdf: number };
  duplicados: { umbral_parecido: number; umbral_casi_identico: number };
  indice: { total_documentos: number; consultas_extra: string[] };
}

export interface Umbrales {
  ocr: { segundos_por_pagina_max: number; palabras_correctas_min: number; defectos_limpios: string[] };
  carpeta: { acierto_min: number; modo_para_decidir: "solo_nombre" | "nombre_y_descripcion" };
  resumen: { segundos_max: number; calidad_min: number; modelo_pequeno: string };
  fechas: { acierto_min: number };
  duplicados: { falsos_positivos_max: number };
  busqueda: { segundos_max: number };
}

export interface FilaClave {
  archivo: string; tipo: string; defecto: string; idioma: "es" | "en"; carpeta_correcta: string;
  titulo: string; vence: string; fecha_como_aparece: string; fecha_ambigua: string;
  otra_lectura_posible: string; duplicado_de: string; version_de: string; texto_esperado: string;
}

export interface DocCrudo {
  archivo: string; hash: string; metodo: "texto del PDF" | "OCR"; paginas: number;
  segundosPorPagina: number[]; confianza: number; texto: string; bytes: number;
}

export interface Crudo {
  navegador: string; hilos: number; ocrSegundosInicio: number;
  documentos: DocCrudo[];
  embeddings: { ok: true; segundosCarga: number; segundosPorDocumento: number; vecDocs: number[][]; vecNombre: number[][]; vecDescripcion: number[][] }
    | { ok: false; error: string };
  indice: { ok: true; documentos: number; segundosAbrir: number; segundosAgregar: number; consultas: { consulta: string; segundos: number; ids: string[] }[] }
    | { ok: false; error: string };
}

export interface Resumen {
  id: string; modelo: string; archivo: string; texto: string; segundos: number;
  segundosCarga: number; tokensPorSegundo: number; error?: string;
}

export interface MedicionOllama {
  disponible: boolean; error?: string;
  modelos: { modelo: string; instalado: boolean; segundosCarga?: number; memoriaGB?: number }[];
  resumenes: Resumen[];
}

export interface Equipo {
  sistema: string; procesador: string; nucleos: number; memoriaGB: number; navegador: string; fecha: string;
}
