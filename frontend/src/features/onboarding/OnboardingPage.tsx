import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";

/**
 * Upload du papier entête d'une société — première fois (onboarding) ou
 * remplacement d'un entête déjà existant. L'utilisateur envoie le fichier
 * tel quel (image, PDF ou docx) — la conversion et la détection de zone se
 * font côté serveur, en tâche async. Un remplacement remet la validation à
 * zéro côté serveur (nouveau fichier = nouvelle zone à valider).
 */
export function OnboardingPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const { data: company } = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => api.get(`/companies/${companyId}/`).then((r) => r.data),
    enabled: Boolean(companyId),
  });
  const isReplacing = Boolean(company?.letterhead);

  async function handleUpload() {
    if (!file || !companyId) return;
    setStatus("uploading");
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await api.post(`/ingestion/companies/${companyId}/letterhead/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setStatus("done");
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      navigate("/companies", { replace: true });
    } catch {
      setStatus("idle");
      setError("Échec de l'envoi du papier entête. Réessaie.");
    }
  }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      {!isReplacing && <p className="section-title">Étape 3 sur 3</p>}
      <h1>{isReplacing ? "Remplacer le papier entête" : "Ajoute ton papier entête"}</h1>
      <p className="page-intro">
        Image, PDF ou Word — utilisé tel quel, sans modification. C'est le fond de page de tous tes futurs documents.
        {isReplacing && " Le nouveau fichier remplacera l'actuel et devra être validé à nouveau."}
      </p>

      <label htmlFor="letterhead-file" className={`dropzone${file ? " has-file" : ""}`}>
        <input
          id="letterhead-file"
          type="file"
          accept="image/*,.pdf,.docx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <p style={{ margin: "8px 0 0", fontSize: 13 }}>
          {file ? `Sélectionné : ${file.name}` : "Choisis un fichier (image, PDF ou .docx)"}
        </p>
      </label>

      {error && <p role="alert">{error}</p>}
      <button
        onClick={handleUpload}
        disabled={!file || status === "uploading"}
        style={{ width: "100%", justifyContent: "center" }}
      >
        {status === "uploading" ? "Envoi..." : "Valider"}
      </button>
    </div>
  );
}
