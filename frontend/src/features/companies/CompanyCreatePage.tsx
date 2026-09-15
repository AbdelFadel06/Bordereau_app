import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

/**
 * Première étape après l'inscription : créer la société. On ne demande que
 * le nom, puisque tout le reste (adresse, contacts, logo...) est déjà
 * visible sur le papier entête uploadé à l'étape suivante.
 */
export function CompanyCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await api.post("/companies/", { name });
      navigate(`/onboarding/${data.id}`, { replace: true });
    } catch {
      setError("Impossible de créer la société. Réessaie.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <p className="section-title">Étape 2 sur 3</p>
      <h1>Ta société</h1>
      <p className="page-intro">
        Comment s'appelle ta société ? Tu pourras ajouter son papier entête juste après.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="name">Nom de la société</label>
          <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting || !name.trim()}>
          {submitting ? "Création..." : "Continuer"}
        </button>
      </form>
    </div>
  );
}
