import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Copy, Download, FileSpreadsheet, Lock, Plus, ScanLine, Save, Trash2 } from "lucide-react";
import { api } from "../../api/client";
import { DOC_TYPES } from "./docTypes";

interface Article {
  id: number;
  designation: string;
  default_unit: string;
  default_reference: string;
  default_price: string | null;
}

interface Company {
  id: number;
  name: string;
  letterhead: { is_validated: boolean } | null;
}

interface LineForm {
  designation: string;
  unit: string;
  reference: string;
  quantity: string;
  unit_price: string;
  is_taxable: boolean;
  observation: string;
}

interface DocumentForm {
  company: number | null;
  doc_type: string;
  number: string;
  client: string;
  issued_at: string;
  issued_place: string;
  object_note: string;
  signatory_name: string;
}

const emptyLine = (): LineForm => ({
  designation: "",
  unit: "",
  reference: "",
  quantity: "1",
  unit_price: "",
  is_taxable: false,
  observation: "",
});
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Création/édition d'un document : seuls le type, le client, la date et
 * les articles sont saisis — les infos société viennent du papier entête
 * déjà enregistré, jamais ressaisies ici.
 */
export function DocumentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = Boolean(id);
  const queryCompanyId = searchParams.get("company");

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => api.get("/companies/").then((r) => r.data),
  });

  const { data: existingDocument } = useQuery({
    queryKey: ["document", id],
    queryFn: () => api.get(`/documents/${id}/`).then((r) => r.data),
    enabled: isEditing,
  });

  const [form, setForm] = useState<DocumentForm>({
    company: null,
    doc_type: "bordereau",
    number: "",
    client: "",
    issued_at: today(),
    issued_place: "",
    object_note: "",
    signatory_name: "",
  });
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const isProforma = form.doc_type === "proforma";
  const [documentId, setDocumentId] = useState<number | null>(id ? Number(id) : null);
  const [documentNumber, setDocumentNumber] = useState<string | null>(null);
  const [documentStatus, setDocumentStatus] = useState<"draft" | "final" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Résolution de la société pour un NOUVEAU document : depuis le paramètre
  // d'URL ?company= (vue déjà filtrée), sinon auto-sélection si une seule
  // société, sinon on laisse le chooser ci-dessous demander laquelle. Dans
  // tous les cas, une société dont le papier entête n'est pas validé
  // redirige vers l'upload plutôt que de laisser créer un document.
  useEffect(() => {
    if (isEditing || !companies || form.company !== null) return;

    const targetId = queryCompanyId ? Number(queryCompanyId) : companies.length === 1 ? companies[0].id : null;
    if (targetId === null) return;

    const target = companies.find((c) => c.id === targetId);
    if (!target) {
      // Société inconnue/pas la sienne : on retombe sur le chooser.
      if (queryCompanyId) setSearchParams({}, { replace: true });
      return;
    }
    if (!target.letterhead?.is_validated) {
      navigate(`/onboarding/${target.id}`, { replace: true });
      return;
    }
    setForm((f) => ({ ...f, company: target.id }));
  }, [companies, isEditing, form.company, queryCompanyId, navigate, setSearchParams]);

  function chooseCompany(companyId: number) {
    setSearchParams({ company: String(companyId) });
  }

  useEffect(() => {
    if (!existingDocument) return;
    setForm({
      company: existingDocument.company,
      doc_type: existingDocument.doc_type,
      number: existingDocument.number,
      client: existingDocument.client,
      issued_at: existingDocument.issued_at,
      issued_place: existingDocument.issued_place ?? "",
      object_note: existingDocument.object_note ?? "",
      signatory_name: existingDocument.signatory_name ?? "",
    });
    setLines(
      existingDocument.lines.length
        ? existingDocument.lines.map((l: any) => ({
            designation: l.designation,
            unit: l.unit ?? "",
            reference: l.reference ?? "",
            quantity: String(l.quantity),
            unit_price: l.unit_price != null ? String(l.unit_price) : "",
            is_taxable: Boolean(l.is_taxable),
            observation: l.observation ?? "",
          }))
        : [emptyLine()]
    );
    setDocumentNumber(existingDocument.number);
    setDocumentStatus(existingDocument.status);
  }, [existingDocument]);

  const { data: articles } = useQuery<Article[]>({
    queryKey: ["articles", form.company],
    queryFn: () => api.get(`/catalog/articles/?company=${form.company}`).then((r) => r.data),
    enabled: Boolean(form.company),
  });

  const articleByDesignation = useMemo(() => {
    const map = new Map<string, Article>();
    articles?.forEach((a) => map.set(a.designation, a));
    return map;
  }, [articles]);

  function updateLine(index: number, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function handleDesignationChange(index: number, value: string) {
    const match = articleByDesignation.get(value);
    if (match) {
      updateLine(index, {
        designation: value,
        unit: match.default_unit || "",
        reference: match.default_reference || "",
        unit_price: match.default_price ?? "",
      });
    } else {
      updateLine(index, { designation: value });
    }
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        lines: lines.map((l) => ({
          designation: l.designation,
          unit: l.unit,
          reference: l.reference,
          quantity: l.quantity,
          unit_price: isProforma ? l.unit_price || null : null,
          is_taxable: isProforma ? l.is_taxable : false,
          observation: l.observation,
        })),
      };
      if (documentId) {
        return api.patch(`/documents/${documentId}/`, payload).then((r) => r.data);
      }
      return api.post("/documents/", payload).then((r) => r.data);
    },
    onSuccess: (data) => {
      setError(null);
      setDocumentNumber(data.number);
      setDocumentStatus(data.status);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      if (!documentId) {
        setDocumentId(data.id);
        navigate(`/documents/${data.id}`, { replace: true });
      }
    },
    onError: (err: any) => {
      const numberError = err?.response?.data?.number?.[0];
      setError(numberError ?? "Échec de l'enregistrement du document. Vérifie les champs.");
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: () => api.post(`/documents/${documentId}/finalize/`).then((r) => r.data),
    onSuccess: (data) => {
      setPdfError(null);
      setDocumentStatus(data.status);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err: any) => setPdfError(err?.response?.data?.detail ?? "Échec de la finalisation."),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => api.post(`/documents/${documentId}/duplicate/`).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate(`/documents/${data.id}`);
    },
  });

  async function handleGeneratePdf() {
    if (!documentId) return;
    setPdfError(null);
    try {
      const response = await api.get(`/documents/${documentId}/pdf/`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${form.doc_type}-${documentNumber ?? documentId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          setPdfError(JSON.parse(text).detail ?? "Échec de la génération du PDF.");
        } catch {
          setPdfError("Échec de la génération du PDF.");
        }
      } else {
        setPdfError("Échec de la génération du PDF.");
      }
    }
  }

  if (companies && companies.length === 0) {
    return (
      <div className="empty-state">
        <p style={{ marginBottom: 8 }}>Tu n'as pas encore de société.</p>
        <button type="button" onClick={() => navigate("/company/new")}>
          Créer ma société
        </button>
      </div>
    );
  }

  const needsCompanyChooser =
    !isEditing && companies && companies.length > 1 && !queryCompanyId && form.company === null;

  if (needsCompanyChooser) {
    return (
      <div>
        <h1>Nouveau document</h1>
        <p className="page-intro">Pour quelle société ?</p>
        <ul className="company-picker">
          {companies!.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => chooseCompany(c.id)}>
                {c.name}
                <ArrowRight size={16} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const selectedCompanyName = companies?.find((c) => c.id === form.company)?.name;

  return (
    <div>
      <h1>
        {isEditing ? "Modifier le document" : "Nouveau document"}
        {documentNumber && ` — N°${documentNumber}`}
        {documentStatus === "final" && (
          <span className="status-badge status-badge--ok" style={{ marginLeft: 10, verticalAlign: "middle" }}>
            <Lock size={11} /> Finalisé
          </span>
        )}
      </h1>
      {selectedCompanyName && !isEditing && <p className="page-intro">Pour {selectedCompanyName}</p>}

      <datalist id="articles-datalist">
        {articles?.map((a) => (
          <option key={a.id} value={a.designation} />
        ))}
      </datalist>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="doc_type">Type</label>
              <select
                id="doc_type"
                value={form.doc_type}
                onChange={(e) => setForm({ ...form, doc_type: e.target.value })}
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="number">Numéro</label>
              <input
                id="number"
                type="text"
                placeholder="Auto"
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
              />
              <span className="field-hint">Laisse vide pour incrémenter automatiquement</span>
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="client">Client</label>
              <input
                id="client"
                type="text"
                required
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="issued_at">Date</label>
              <input
                id="issued_at"
                type="date"
                required
                value={form.issued_at}
                onChange={(e) => setForm({ ...form, issued_at: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="issued_place">Lieu</label>
              <input
                id="issued_place"
                type="text"
                value={form.issued_place}
                onChange={(e) => setForm({ ...form, issued_place: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="object_note">Objet</label>
            <input
              id="object_note"
              type="text"
              value={form.object_note}
              onChange={(e) => setForm({ ...form, object_note: e.target.value })}
            />
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="signatory_name">Nom du gérant / de la directrice (facultatif)</label>
            <input
              id="signatory_name"
              type="text"
              value={form.signatory_name}
              onChange={(e) => setForm({ ...form, signatory_name: e.target.value })}
            />
          </div>
        </div>

        <p className="section-title">Lignes</p>

        <div className="lines-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Désignation</th>
                <th>Unité</th>
                <th>Référence</th>
                <th>Quantité</th>
                {isProforma && <th>PU</th>}
                {isProforma && <th>Taxable</th>}
                {!isProforma && <th>Observation</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td>
                    <input
                      type="text"
                      required
                      list="articles-datalist"
                      value={line.designation}
                      onChange={(e) => handleDesignationChange(index, e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={line.unit}
                      onChange={(e) => updateLine(index, { unit: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={line.reference}
                      onChange={(e) => updateLine(index, { reference: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: e.target.value })}
                    />
                  </td>
                  {isProforma && (
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        required
                        value={line.unit_price}
                        onChange={(e) => updateLine(index, { unit_price: e.target.value })}
                      />
                    </td>
                  )}
                  {isProforma && (
                    <td>
                      <input
                        type="checkbox"
                        checked={line.is_taxable}
                        onChange={(e) => updateLine(index, { is_taxable: e.target.checked })}
                      />
                    </td>
                  )}
                  {!isProforma && (
                    <td>
                      <input
                        type="text"
                        value={line.observation}
                        onChange={(e) => updateLine(index, { observation: e.target.value })}
                      />
                    </td>
                  )}
                  <td>
                    <button
                      type="button"
                      className="btn-danger-ghost btn-icon-collapsible"
                      onClick={() => removeLine(index)}
                      disabled={lines.length === 1}
                      aria-label="Supprimer la ligne"
                    >
                      <Trash2 size={14} />
                      <span className="btn-label">Supprimer</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isProforma && (
          <p className="field-hint">
            Pour les produits taxables, le prix unitaire (PU) doit être saisi TTC (TVA 18% incluse) — la TVA sera
            extraite automatiquement sur le PDF.
          </p>
        )}

        <button type="button" className="btn-secondary btn-icon-collapsible" onClick={addLine}>
          <Plus size={15} />
          <span className="btn-label">Ajouter une ligne</span>
        </button>

        <div className="import-options">
          <div className="import-option">
            <FileSpreadsheet size={18} className="import-option__icon" />
            <div>
              <div className="import-option__title">
                Importer un fichier <span className="import-option__badge">Bientôt</span>
              </div>
              <p>Charge un CSV ou Excel pour remplir les lignes automatiquement.</p>
            </div>
          </div>
          <div className="import-option">
            <ScanLine size={18} className="import-option__icon" />
            <div>
              <div className="import-option__title">
                Importer par photo/scan <span className="import-option__badge">Bientôt</span>
              </div>
              <p>Prends en photo une liste d'articles et laisse l'OCR la retranscrire.</p>
            </div>
          </div>
        </div>

        {error && <p role="alert">{error}</p>}

        <div className="actions-row">
          <button type="submit" disabled={saveMutation.isPending || !form.company} className="btn-icon-collapsible">
            <Save size={15} />
            <span className="btn-label">{saveMutation.isPending ? "Enregistrement..." : "Enregistrer"}</span>
          </button>
          <button
            type="button"
            className="btn-secondary btn-icon-collapsible"
            onClick={handleGeneratePdf}
            disabled={!documentId}
          >
            <Download size={15} />
            <span className="btn-label">{documentStatus === "final" ? "Télécharger le PDF" : "Générer le PDF"}</span>
          </button>
          {documentId && documentStatus === "draft" && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => finalizeMutation.mutate()}
              disabled={finalizeMutation.isPending}
              title="Fige le PDF actuel comme copie archivée — retéléchargeable à l'identique plus tard, même si tu modifies le document ensuite"
            >
              <Lock size={15} /> {finalizeMutation.isPending ? "Finalisation..." : "Finaliser"}
            </button>
          )}
          {documentId && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => duplicateMutation.mutate()}
              disabled={duplicateMutation.isPending}
            >
              <Copy size={15} /> {duplicateMutation.isPending ? "Duplication..." : "Dupliquer"}
            </button>
          )}
        </div>
        {documentStatus === "final" && (
          <p className="field-hint">
            Ce document est finalisé : le PDF archivé lors de la finalisation est toujours celui téléchargé, même si
            tu modifies le document ensuite (il repassera alors en brouillon).
          </p>
        )}
        {pdfError && <p role="alert">{pdfError}</p>}
      </form>
    </div>
  );
}
