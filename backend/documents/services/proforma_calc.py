"""Calculs spécifiques à la facture proforma : séparation des lignes
taxables/non taxables, TVA, AIB et totaux — reproduit exactement la logique
d'une facture proforma réelle OLADOKOUN ET FILS fournie en référence.

Règles (déduites de cette référence) :
- Les lignes non taxables sont saisies en prix HT ; leur somme est le
  "Total non taxables HT".
- Les lignes taxables sont saisies en prix TTC (TVA 18% déjà incluse) ; leur
  somme est le "Total taxables TTC". La TVA est donc EXTRAITE de ce TTC
  (TTC / 1.18), pas ajoutée à un HT.
- Total HT Général = Total non taxables HT + Total taxables HT (extrait)
- AIB (1%) = 1% du Total HT Général — affiché pour information, mais PAS
  ajouté au TOTAL TTC Général (l'AIB est une retenue à la source, pas un
  supplément facturé au client).
- TOTAL TTC Général = Total non taxables HT + Total taxables TTC
"""
from decimal import Decimal, ROUND_HALF_UP
from num2words import num2words

TVA_RATE = Decimal("0.18")
AIB_RATE = Decimal("0.01")


def _round(value: Decimal) -> Decimal:
    return value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def format_amount(value: Decimal) -> str:
    return f"{int(_round(value)):,}".replace(",", " ")


def compute_proforma_totals(lines) -> dict:
    non_taxable_lines = []
    taxable_lines = []
    total_non_taxable_ht = Decimal("0")
    total_taxable_ttc = Decimal("0")

    for line in lines:
        unit_price = line.unit_price or Decimal("0")
        montant = line.quantity * unit_price
        row = {
            "position": f"{line.position:02d}",
            "reference": line.reference,
            "designation": line.designation,
            "unit": line.unit,
            "quantity": format_amount(line.quantity),
            "unit_price": format_amount(unit_price),
            "montant": format_amount(montant),
        }
        if line.is_taxable:
            taxable_lines.append(row)
            total_taxable_ttc += montant
        else:
            non_taxable_lines.append(row)
            total_non_taxable_ht += montant

    tva = total_taxable_ttc - (total_taxable_ttc / (Decimal("1") + TVA_RATE))
    total_taxable_ht = total_taxable_ttc - tva
    total_ht_general = total_non_taxable_ht + total_taxable_ht
    aib = total_ht_general * AIB_RATE
    total_ttc_general = total_non_taxable_ht + total_taxable_ttc

    amount_words = num2words(int(_round(total_ttc_general)), lang="fr")

    return {
        "non_taxable_lines": non_taxable_lines,
        "taxable_lines": taxable_lines,
        "total_non_taxable_ht": format_amount(total_non_taxable_ht),
        "total_taxable_ttc": format_amount(total_taxable_ttc),
        "tva": format_amount(tva),
        "total_taxable_ht": format_amount(total_taxable_ht),
        "total_ht_general": format_amount(total_ht_general),
        "aib": format_amount(aib),
        "total_ttc_general": format_amount(total_ttc_general),
        "amount_words": amount_words,
    }
