import { docTypeLabel } from "./docTypes";
import { computeProformaPreviewTotals, formatAmount, type PreviewLine } from "./proformaPreviewCalc";

interface DocumentPreviewProps {
  companyName?: string;
  docType?: string;
  number: string;
  client: string;
  issuedAt: string;
  issuedPlace: string;
  objectNote: string;
  lines: PreviewLine[];
}

function formatShortDate(isoDate: string): string {
  if (!isoDate) return "...";
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${d}/${m}/${y}` : isoDate;
}

function formatLongDate(isoDate: string): string {
  if (!isoDate) return "...";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

/**
 * Aperçu approximatif du contenu du document (pas le vrai rendu WeasyPrint,
 * pas le papier entête) — se met à jour en direct pendant la saisie, avant
 * même d'enregistrer. Utile pour vérifier la mise en page/les calculs sans
 * attendre de générer le vrai PDF.
 */
export function DocumentPreview({
  companyName,
  docType,
  number,
  client,
  issuedAt,
  issuedPlace,
  objectNote,
  lines,
}: DocumentPreviewProps) {
  const isProforma = docType === "proforma";

  return (
    <div className="doc-preview">
      <p className="field-hint" style={{ marginBottom: 8 }}>
        Aperçu approximatif du contenu — le vrai PDF inclut ton papier entête et peut différer légèrement.
      </p>
      <div className="doc-preview__page">
        {isProforma ? (
          <ProformaPreview
            companyName={companyName}
            number={number}
            client={client}
            issuedAt={issuedAt}
            issuedPlace={issuedPlace}
            objectNote={objectNote}
            lines={lines}
          />
        ) : (
          <BordereauPreview
            companyName={companyName}
            docType={docType}
            number={number}
            client={client}
            issuedAt={issuedAt}
            issuedPlace={issuedPlace}
            objectNote={objectNote}
            lines={lines}
          />
        )}
      </div>
    </div>
  );
}

function BordereauPreview({
  companyName,
  docType,
  number,
  client,
  issuedAt,
  issuedPlace,
  objectNote,
  lines,
}: DocumentPreviewProps) {
  return (
    <>
      {companyName && <p className="doc-preview__company">{companyName}</p>}
      <p className="doc-preview__meta">
        {issuedPlace || "..."} le {formatShortDate(issuedAt)}
      </p>
      <h3 className="doc-preview__title">
        {docTypeLabel(docType ?? "")} {number && `N° ${number}`}
      </h3>
      <p>
        <strong>OBJET :</strong> {objectNote}
      </p>
      <p>
        <strong>CLIENT :</strong> {client || "..."}
      </p>
      <div className="doc-preview__table-wrap">
        <table className="doc-preview__table">
          <thead>
            <tr>
              <th>N°</th>
              <th>Désignation</th>
              <th>Unité</th>
              <th>Réf</th>
              <th>Quantité</th>
              <th>Observation</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td>{String(i + 1).padStart(2, "0")}</td>
                <td>{line.designation}</td>
                <td>{line.unit}</td>
                <td>{line.reference}</td>
                <td>{formatAmount(parseFloat(line.quantity) || 0)}</td>
                <td>{line.observation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProformaPreview({ companyName, number, client, issuedAt, issuedPlace, objectNote, lines }: DocumentPreviewProps) {
  const totals = computeProformaPreviewTotals(lines);

  return (
    <>
      {companyName && <p className="doc-preview__company">{companyName}</p>}
      <p className="doc-preview__meta">
        {issuedPlace || "..."}, le {formatLongDate(issuedAt)}
      </p>
      <h3 className="doc-preview__title">FACTURE PROFORMA {number && `N° ${number}`}</h3>
      <p>
        <strong>CLIENT :</strong> {client || "..."}
      </p>
      {objectNote && (
        <p>
          <strong>Objet :</strong> <em>{objectNote}</em>
        </p>
      )}
      <div className="doc-preview__table-wrap">
        <table className="doc-preview__table">
          <thead>
            <tr>
              <th>N°</th>
              <th>Réf</th>
              <th>Désignation</th>
              <th>Unité</th>
              <th>Quantité</th>
              <th>PU</th>
              <th>Montant</th>
            </tr>
          </thead>
          <tbody>
          {totals.nonTaxableLines.length > 0 && (
            <>
              <tr className="doc-preview__group-header">
                <td colSpan={7}>Produits non taxables</td>
              </tr>
              {totals.nonTaxableLines.map((line, i) => (
                <tr key={`nt-${i}`}>
                  <td>{String(i + 1).padStart(2, "0")}</td>
                  <td>{line.reference}</td>
                  <td>{line.designation}</td>
                  <td>{line.unit}</td>
                  <td>{formatAmount(parseFloat(line.quantity) || 0)}</td>
                  <td>{formatAmount(parseFloat(line.unit_price) || 0)}</td>
                  <td>{formatAmount((parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0))}</td>
                </tr>
              ))}
              <tr className="doc-preview__totals-row">
                <td colSpan={6}>Total non taxables HT</td>
                <td>{totals.totalNonTaxableHT}</td>
              </tr>
            </>
          )}
          {totals.taxableLines.length > 0 && (
            <>
              <tr className="doc-preview__group-header">
                <td colSpan={7}>Produits taxables (prix TTC, TVA incluse)</td>
              </tr>
              {totals.taxableLines.map((line, i) => (
                <tr key={`t-${i}`}>
                  <td>{String(i + 1).padStart(2, "0")}</td>
                  <td>{line.reference}</td>
                  <td>{line.designation}</td>
                  <td>{line.unit}</td>
                  <td>{formatAmount(parseFloat(line.quantity) || 0)}</td>
                  <td>{formatAmount(parseFloat(line.unit_price) || 0)} TTC</td>
                  <td>{formatAmount((parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0))}</td>
                </tr>
              ))}
              <tr className="doc-preview__totals-row">
                <td colSpan={6}>Total taxables TTC</td>
                <td>{totals.totalTaxableTTC}</td>
              </tr>
              <tr className="doc-preview__totals-row">
                <td colSpan={6}>TVA (18%)</td>
                <td>{totals.tva}</td>
              </tr>
              <tr className="doc-preview__totals-row">
                <td colSpan={6}>Total taxables HT</td>
                <td>{totals.totalTaxableHT}</td>
              </tr>
            </>
          )}
          <tr className="doc-preview__totals-row">
            <td colSpan={6}>Total HT Général</td>
            <td>{totals.totalHTGeneral}</td>
          </tr>
          <tr className="doc-preview__totals-row">
            <td colSpan={6}>AIB (1%)</td>
            <td>{totals.aib}</td>
          </tr>
          <tr className="doc-preview__totals-row">
            <td colSpan={6}>TOTAL TTC Général</td>
            <td>{totals.totalTTCGeneral}</td>
          </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
