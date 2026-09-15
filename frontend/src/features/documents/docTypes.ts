export const DOC_TYPES = [
  { value: "bordereau", label: "Bordereau de livraison", shortLabel: "Bordereau" },
  { value: "provisoire", label: "Bordereau provisoire", shortLabel: "Provisoire" },
  { value: "proforma", label: "Facture proforma", shortLabel: "Proforma" },
];

export function docTypeLabel(value: string): string {
  return DOC_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function docTypeShortLabel(value: string): string {
  return DOC_TYPES.find((t) => t.value === value)?.shortLabel ?? value;
}
