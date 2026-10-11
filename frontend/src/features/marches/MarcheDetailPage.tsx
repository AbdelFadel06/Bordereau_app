import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FileText, Paperclip, Plus, Save, Trash2, Truck, X } from "lucide-react";
import { api } from "../../api/client";
import { docTypeShortLabel } from "../documents/docTypes";

interface Company {
  id: number;
  name: string;
}

interface MarcheLineForm {
  id?: number;
  designation: string;
  unit: string;
  reference: string;
  quantity_ordered: string;
  quantity_delivered?: number;
  quantity_remaining?: number;
}

interface MarcheDoc {
  id: number;
  label: string;
  file: string;
  uploaded_at: string;
}

interface DeliveryLine {
  marche_line: number | null;
  designation: string;
  unit: string;
  quantity: string;
}

interface Delivery {
  id: number;
  doc_type: string;
  number: string;
  issued_at: string;
  lines: DeliveryLine[];
}

interface MarcheDetail {
  id: number;
  company: number;
  client_name: string;
  object_note: string;
  created_at: string;
  documents: MarcheDoc[];
  lines: MarcheLineForm[];
  deliveries: Delivery[];
}

const emptyLine = (): MarcheLineForm => ({ designation: "", unit: "", reference: "", quantity_ordered: "" });

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${d}/${m}/${y}` : isoDate;
}

export function MarcheDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = Boolean(id);
  const queryCompanyId = searchParams.get("company");

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => api.get("/companies/").then((r) => r.data),
  });

  const { data: existingMarche } = useQuery<MarcheDetail>({
    queryKey: ["marche", id],
    queryFn: () => api.get(`/marches/${id}/`).then((r) => r.data),
    enabled: isEditing,
  });

  const [companyId, setCompanyId] = useState<number | null>(queryCompanyId ? Number(queryCompanyId) : null);
  const [clientName, setClientName] = useState("");
  const [objectNote, setObjectNote] = useState("");
  const [lines, setLines] = useState<MarcheLineForm[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [docLabel, setDocLabel] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing || !companies || companyId !== null) return;
    if (companies.length === 1) setCompanyId(companies[0].id);
  }, [companies, isEditing, companyId]);

  useEffect(() => {
    if (!existingMarche) return;
    setCompanyId(existingMarche.company);
    setClientName(existingMarche.client_name);
    setObjectNote(existingMarche.object_note);
    setLines(existingMarche.lines.length ? existingMarche.lines.map((l) => ({ ...l })) : [emptyLine()]);
  }, [existingMarche]);

  function updateLine(index: number, patch: Partial<MarcheLineForm>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(index: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        company: companyId,
        client_name: clientName,
        object_note: objectNote,
        lines: lines
          .filter((l) => l.designation.trim())
          .map((l) => ({
            id: l.id,
            designation: l.designation,
            unit: l.unit,
            reference: l.reference,
            quantity_ordered: l.quantity_ordered || "0",
          })),
      };
      if (id) return api.patch(`/marches/${id}/`, payload).then((r) => r.data);
      return api.post("/marches/", payload).then((r) => r.data);
    },
    onSuccess: (data) => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["marches"] });
      queryClient.invalidateQueries({ queryKey: ["marche", String(data.id)] });
      if (!id) navigate(`/marches/${data.id}`, { replace: true });
    },
    onError: () => setError("Échec de l'enregistrement du marché. Vérifie les champs."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/marches/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marches"] });
      navigate("/marches");
    },
  });

  const uploadDocMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("label", docLabel);
      formData.append("file", docFile as File);
      return api
        .post(`/marches/${id}/documents/`, formData, { headers: { "Content-Type": "multipart/form-data" } })
        .then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marche", id] });
      setDocLabel("");
      setDocFile(null);
      setDocError(null);
    },
    onError: () => setDocError("Échec de l'envoi du document."),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: number) => api.delete(`/marche-documents/${docId}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["marche", id] }),
  });

  function handleDeleteMarche() {
    if (window.confirm(`Supprimer définitivement le marché "${clientName}" ? Cette action est irréversible.`)) {
      deleteMutation.mutate();
    }
  }

  function handleUploadDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!docLabel.trim() || !docFile) {
      setDocError("Libellé et fichier requis.");
      return;
    }
    uploadDocMutation.mutate();
  }

  const needsCompanyChooser = !isEditing && companies && companies.length > 1 && companyId === null;

  if (needsCompanyChooser) {
    return (
      <div>
        <h1>Nouveau marché</h1>
        <p className="page-intro">Pour quelle société ?</p>
        <ul className="company-picker">
          {companies!.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setCompanyId(c.id)}>
                {c.name}
                <ArrowRight size={16} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <h1>{isEditing ? `Marché — ${clientName || "..."}` : "Nouveau marché"}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="client_name">Client</label>
              <input id="client_name" type="text" required value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="object_note">Objet</label>
            <input id="object_note" type="text" value={objectNote} onChange={(e) => setObjectNote(e.target.value)} />
          </div>
        </div>

        <p className="section-title">Articles commandés</p>
        <div className="lines-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Désignation</th>
                <th>Unité</th>
                <th>Référence</th>
                <th>Qté commandée</th>
                {isEditing && <th>Livrée</th>}
                {isEditing && <th>Restante</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td>
                    <input type="text" required value={line.designation} onChange={(e) => updateLine(index, { designation: e.target.value })} />
                  </td>
                  <td>
                    <input type="text" value={line.unit} onChange={(e) => updateLine(index, { unit: e.target.value })} />
                  </td>
                  <td>
                    <input type="text" value={line.reference} onChange={(e) => updateLine(index, { reference: e.target.value })} />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={line.quantity_ordered}
                      onChange={(e) => updateLine(index, { quantity_ordered: e.target.value })}
                    />
                  </td>
                  {isEditing && <td className="num">{line.quantity_delivered ?? 0}</td>}
                  {isEditing && (
                    <td className="num" style={{ color: (line.quantity_remaining ?? 0) < 0 ? "var(--color-danger)" : undefined }}>
                      {line.quantity_remaining ?? line.quantity_ordered}
                    </td>
                  )}
                  <td>
                    <button
                      type="button"
                      className="btn-danger-ghost"
                      onClick={() => removeLine(index)}
                      disabled={lines.length === 1}
                      aria-label="Supprimer la ligne"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn-secondary btn-icon-collapsible" onClick={addLine}>
          <Plus size={15} />
          <span className="btn-label">Ajouter un article</span>
        </button>

        {error && <p role="alert">{error}</p>}

        <div className="actions-row">
          <button type="submit" disabled={saveMutation.isPending || !companyId} className="btn-icon-collapsible">
            <Save size={15} />
            <span className="btn-label">{saveMutation.isPending ? "Enregistrement..." : "Enregistrer"}</span>
          </button>
          {isEditing && (
            <button type="button" className="btn-danger-ghost" onClick={handleDeleteMarche} disabled={deleteMutation.isPending}>
              <Trash2 size={15} /> {deleteMutation.isPending ? "Suppression..." : "Supprimer le marché"}
            </button>
          )}
        </div>
      </form>

      {isEditing && existingMarche && (
        <>
          <p className="section-title">
            <Paperclip size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Documents de référence
          </p>
          {existingMarche.documents.length > 0 && (
            <ul className="marche-doc-list">
              {existingMarche.documents.map((doc) => (
                <li key={doc.id}>
                  <a href={doc.file} target="_blank" rel="noreferrer">
                    <FileText size={14} /> {doc.label}
                  </a>
                  <button
                    type="button"
                    className="doc-list__delete"
                    aria-label="Supprimer ce document"
                    onClick={() => {
                      if (window.confirm(`Supprimer "${doc.label}" ?`)) deleteDocMutation.mutate(doc.id);
                    }}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleUploadDoc} className="marche-doc-upload">
            <input
              type="text"
              placeholder="Libellé (ex: Contrat signé)"
              value={docLabel}
              onChange={(e) => setDocLabel(e.target.value)}
            />
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
            />
            <button type="submit" className="btn-secondary" disabled={uploadDocMutation.isPending}>
              {uploadDocMutation.isPending ? "Envoi..." : "Ajouter"}
            </button>
          </form>
          {docError && <p role="alert">{docError}</p>}

          <p className="section-title">
            <Truck size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Livraisons
          </p>
          <button
            type="button"
            className="btn-accent"
            style={{ marginBottom: 14 }}
            onClick={() => navigate(`/documents/new?company=${companyId}&marche=${id}`)}
          >
            <Plus size={15} /> Nouveau bordereau pour ce marché
          </button>

          {existingMarche.deliveries.length === 0 && <p className="field-hint">Aucune livraison enregistrée pour l'instant.</p>}
          {existingMarche.deliveries.length > 0 && (
            <ul className="marche-delivery-list">
              {existingMarche.deliveries.map((delivery) => (
                <li key={delivery.id}>
                  <a href={`/documents/${delivery.id}`} className="marche-delivery-list__header">
                    <span>
                      {docTypeShortLabel(delivery.doc_type)} N°{delivery.number}
                    </span>
                    <span>{formatDate(delivery.issued_at)}</span>
                  </a>
                  <ul className="marche-delivery-list__lines">
                    {delivery.lines.map((line, i) => (
                      <li key={i}>
                        {line.designation} — {line.quantity} {line.unit}
                        {line.marche_line === null && <span className="field-hint"> (hors marché)</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
