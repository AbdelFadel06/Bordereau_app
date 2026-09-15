import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password, firstName, lastName);
      // Une fois inscrit, l'utilisateur doit d'abord créer sa société
      // avant de pouvoir uploader son papier entête.
      navigate("/company/new", { replace: true });
    } catch (err: any) {
      const detail = err?.response?.data?.email?.[0] ?? err?.response?.data?.password?.[0];
      setError(detail ?? "Impossible de créer le compte.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="card card--narrow">
        <h1>Créer un compte</h1>
        <p className="page-intro">Étape 1 sur 3 — société et papier entête juste après.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="first_name">Prénom</label>
              <input id="first_name" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="last_name">Nom</label>
              <input id="last_name" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={submitting} style={{ width: "100%", justifyContent: "center" }}>
            {submitting ? "Création..." : "Créer mon compte"}
          </button>
        </form>
        <p style={{ marginTop: 16, marginBottom: 0 }}>
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
