/**
 * Import CSV pour les lignes de document. Parseur maison (pas de
 * dépendance) qui gère les champs entre guillemets (virgules/guillemets
 * échappés inclus) — suffisant pour des exports Excel/Sheets standards.
 * Les en-têtes sont reconnus de façon tolérante (accents, casse, variantes
 * courantes) plutôt que d'exiger un format exact.
 */

export interface ImportedLine {
  designation: string;
  unit: string;
  reference: string;
  quantity: string;
  observation: string;
  unit_price: string;
  is_taxable: boolean;
}

export interface ImportResult {
  lines: ImportedLine[];
  skipped: number;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  // Retire un éventuel BOM UTF-8 laissé par Excel.
  const clean = text.replace(/^﻿/, "");

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\r") {
      // ignoré, \n gère le saut de ligne
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

function normalizeHeader(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

const HEADER_ALIASES: Record<string, string[]> = {
  designation: ["DESIGNATION", "ARTICLE", "PRODUIT", "LIBELLE"],
  unit: ["UNITE", "UNITE DE MESURE"],
  reference: ["REF", "REFERENCE"],
  quantity: ["QUANTITE", "QTE", "QTE."],
  observation: ["OBSERVATION", "OBSERVATIONS", "NOTE", "REMARQUE"],
  unit_price: ["PU", "PRIX", "PRIX UNITAIRE"],
  is_taxable: ["TAXABLE"],
};

function findColumn(header: string[], key: keyof typeof HEADER_ALIASES): number {
  return header.findIndex((h) => HEADER_ALIASES[key].includes(h));
}

export function parseCsvToLines(text: string): ImportResult {
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    throw new Error("Le fichier est vide.");
  }

  const header = rows[0].map(normalizeHeader);
  const idx = {
    designation: findColumn(header, "designation"),
    unit: findColumn(header, "unit"),
    reference: findColumn(header, "reference"),
    quantity: findColumn(header, "quantity"),
    observation: findColumn(header, "observation"),
    unit_price: findColumn(header, "unit_price"),
    is_taxable: findColumn(header, "is_taxable"),
  };

  if (idx.designation === -1) {
    throw new Error(
      "Colonne « Désignation » introuvable. Vérifie que la première ligne du fichier contient les en-têtes de colonnes."
    );
  }

  const lines: ImportedLine[] = [];
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const designation = (row[idx.designation] ?? "").trim();
    if (!designation) {
      skipped++;
      continue;
    }
    lines.push({
      designation,
      unit: idx.unit >= 0 ? (row[idx.unit] ?? "").trim() : "",
      reference: idx.reference >= 0 ? (row[idx.reference] ?? "").trim() : "",
      quantity: idx.quantity >= 0 ? (row[idx.quantity] ?? "").trim() || "1" : "1",
      observation: idx.observation >= 0 ? (row[idx.observation] ?? "").trim() : "",
      unit_price: idx.unit_price >= 0 ? (row[idx.unit_price] ?? "").trim() : "",
      is_taxable: idx.is_taxable >= 0 ? /^(oui|yes|true|1|x)$/i.test((row[idx.is_taxable] ?? "").trim()) : false,
    });
  }

  return { lines, skipped };
}
