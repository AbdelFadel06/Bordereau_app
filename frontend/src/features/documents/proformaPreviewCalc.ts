/**
 * Reproduit côté client (pour l'aperçu en direct, avant enregistrement) la
 * même logique que `documents/services/proforma_calc.py` côté serveur —
 * voir ce fichier pour le détail des règles (TVA extraite du TTC, AIB,
 * TOTAL TTC Général qui n'inclut pas l'AIB). Approximatif : arrondis en
 * JS plutôt qu'en Decimal, suffisant pour une prévisualisation.
 */
export interface PreviewLine {
  designation: string;
  unit: string;
  reference: string;
  quantity: string;
  unit_price: string;
  is_taxable: boolean;
  observation: string;
}

const TVA_RATE = 0.18;
const AIB_RATE = 0.01;

export function formatAmount(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function lineAmount(line: PreviewLine): number {
  const qty = parseFloat(line.quantity) || 0;
  const pu = parseFloat(line.unit_price) || 0;
  return qty * pu;
}

export function computeProformaPreviewTotals(lines: PreviewLine[]) {
  const nonTaxableLines = lines.filter((l) => !l.is_taxable);
  const taxableLines = lines.filter((l) => l.is_taxable);

  const totalNonTaxableHT = nonTaxableLines.reduce((sum, l) => sum + lineAmount(l), 0);
  const totalTaxableTTC = taxableLines.reduce((sum, l) => sum + lineAmount(l), 0);
  const tva = totalTaxableTTC - totalTaxableTTC / (1 + TVA_RATE);
  const totalTaxableHT = totalTaxableTTC - tva;
  const totalHTGeneral = totalNonTaxableHT + totalTaxableHT;
  const aib = totalHTGeneral * AIB_RATE;
  const totalTTCGeneral = totalNonTaxableHT + totalTaxableTTC;

  return {
    nonTaxableLines,
    taxableLines,
    totalNonTaxableHT: formatAmount(totalNonTaxableHT),
    totalTaxableTTC: formatAmount(totalTaxableTTC),
    tva: formatAmount(tva),
    totalTaxableHT: formatAmount(totalTaxableHT),
    totalHTGeneral: formatAmount(totalHTGeneral),
    aib: formatAmount(aib),
    totalTTCGeneral: formatAmount(totalTTCGeneral),
  };
}
