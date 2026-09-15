import { createWorker } from "tesseract.js";
import { type ImportedLine } from "./csvImport";

export interface OcrResult {
  lines: ImportedLine[];
  rawText: string;
}

/**
 * OCR pour des captures d'écran / listes numériques propres (pas des
 * photos de papier physique — bien moins fiable dans ce cas).
 *
 * Piège découvert en testant : Tesseract normalise les espaces multiples
 * en un seul dans `data.text`, donc un simple heuristique "2+ espaces =
 * nouvelle colonne" sur le texte brut ne marche PAS (vérifié : toutes les
 * colonnes se retrouvent séparées par un seul espace, indiscernables des
 * espaces entre mots d'une même cellule). Reconstruction des colonnes à
 * partir des positions (bbox) des mots à la place : un écart horizontal
 * significativement plus grand que l'écart typique entre deux mots d'une
 * même cellule est traité comme une frontière de colonne.
 *
 * Le résultat DOIT être revu manuellement avant import (voir
 * DocumentEditorPage) — l'OCR se trompe souvent sur un chiffre ou une
 * lettre, jamais fusionné directement dans le document.
 */
export async function recognizeArticleList(
  file: File,
  onProgress?: (ratio: number) => void
): Promise<OcrResult> {
  const worker = await createWorker("fra", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(file);
    const table = reconstructTable(data.lines ?? []);
    return { lines: tableToImportedLines(table), rawText: data.text };
  } finally {
    await worker.terminate();
  }
}

interface TessWord {
  text: string;
  bbox: { x0: number; x1: number; y0: number; y1: number };
}
interface TessLine {
  words: TessWord[];
}

function median(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Regroupe les mots de chaque ligne en cellules, en coupant sur les écarts
 * horizontaux nettement plus larges que l'espacement mot-à-mot habituel. */
function reconstructTable(lines: TessLine[]): string[][] {
  const cleanLines = lines
    .map((l) => l.words.filter((w) => w.text.trim().length > 0))
    .filter((words) => words.length > 0);

  const intraWordGaps: number[] = [];
  for (const words of cleanLines) {
    for (let i = 0; i < words.length - 1; i++) {
      intraWordGaps.push(words[i + 1].bbox.x0 - words[i].bbox.x1);
    }
  }
  const typicalGap = median(intraWordGaps.filter((g) => g >= 0)) || 10;
  const columnGapThreshold = Math.max(typicalGap * 3, 20);

  return cleanLines.map((words) => {
    const cells: string[] = [];
    let current: string[] = [];
    let lastX1: number | null = null;
    for (const w of words) {
      if (lastX1 !== null && w.bbox.x0 - lastX1 > columnGapThreshold) {
        cells.push(current.join(" "));
        current = [];
      }
      current.push(w.text);
      lastX1 = w.bbox.x1;
    }
    if (current.length) cells.push(current.join(" "));
    return cells;
  });
}

function normalizeHeader(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9 ]/gi, "")
    .trim()
    .toUpperCase();
}

const HEADER_ALIASES: Record<string, string[]> = {
  designation: ["DESIGNATION", "ARTICLE", "PRODUIT", "LIBELLE"],
  unit: ["UNITE", "UNITE DE MESURE"],
  reference: ["REF", "REFERENCE"],
  quantity: ["QUANTITE", "QTE"],
  observation: ["OBSERVATION", "OBSERVATIONS", "NOTE", "REMARQUE"],
};

function tableToImportedLines(table: string[][]): ImportedLine[] {
  if (table.length === 0) return [];

  const header = table[0].map(normalizeHeader);
  const colIndex = (key: keyof typeof HEADER_ALIASES) =>
    header.findIndex((h) => HEADER_ALIASES[key].some((alias) => h.includes(alias)));

  const idx = {
    designation: colIndex("designation"),
    unit: colIndex("unit"),
    reference: colIndex("reference"),
    quantity: colIndex("quantity"),
    observation: colIndex("observation"),
  };

  const dataRows = idx.designation >= 0 ? table.slice(1) : table;
  const designationCol = idx.designation >= 0 ? idx.designation : 1; // à défaut, 2e colonne (après un éventuel N°)

  const result: ImportedLine[] = [];
  for (const row of dataRows) {
    const designation = (row[designationCol] ?? row[0] ?? "").trim();
    if (!designation) continue;
    result.push({
      designation,
      unit: idx.unit >= 0 ? (row[idx.unit] ?? "").trim() : "",
      reference: idx.reference >= 0 ? (row[idx.reference] ?? "").trim() : "",
      quantity: idx.quantity >= 0 ? (row[idx.quantity] ?? "").trim() || "1" : "1",
      observation: idx.observation >= 0 ? (row[idx.observation] ?? "").trim() : "",
      unit_price: "",
      is_taxable: false,
    });
  }
  return result;
}
