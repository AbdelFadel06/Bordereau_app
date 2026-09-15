import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, FileText, Sparkles } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";

/**
 * Page publique d'accueil. Le CTA "Mes documents" mène vers la liste —
 * si l'utilisateur n'est pas connecté, RequireAuth le renvoie vers /login
 * puis le ramène ici après connexion (comportement déjà en place).
 */
export function HomePage() {
  const { user, logout } = useAuth();

  return (
    <div>
      <header className="landing-header">
        <Link to="/" className="app-header__brand">
          B&amp;F
        </Link>
        <div className="landing-header__links">
          {user ? (
            <>
              <Link to="/documents">Mes documents</Link>
              <button type="button" className="btn-secondary" onClick={logout}>
                Se déconnecter
              </button>
            </>
          ) : (
            <>
              <Link to="/login">Connexion</Link>
              <Link to="/register">
                <button type="button">Créer un compte</button>
              </Link>
            </>
          )}
        </div>
      </header>

      <div className="landing-hero">
        <div>
          <h1>
            Vos documents,
            <br />
            <span style={{ position: "relative", display: "inline-block" }}>
              sur votre papier entête
              <span className="landing-hero__underline" style={{ position: "absolute", left: 0, bottom: 2 }} />
            </span>
          </h1>
          <p className="landing-hero__lede">
            Bordereaux de livraison, bordereaux provisoires et factures proforma générés directement sur le papier
            entête réel de ta société — jamais redessiné, jamais ressaisi.
          </p>
          <div className="landing-hero__ctas">
            <Link to="/documents">
              <button type="button">
                Mes documents <ArrowRight size={16} />
              </button>
            </Link>
          </div>
        </div>

        <div className="mockup-stack">
          <div className="mockup-card mockup-card--doc1">
            <div className="mockup-card__eyebrow">
              <FileText size={13} /> Bordereau de livraison
            </div>
            <div className="mockup-card__title">N° 042</div>
            <div className="mockup-card__row">
              <span>Riz variété locale 25kg</span>
              <span>10</span>
            </div>
            <div className="mockup-card__row">
              <span>Haricot blanc</span>
              <span>20</span>
            </div>
            <div className="mockup-card__row">
              <span>Gari ordinaire</span>
              <span>10</span>
            </div>
          </div>

          <div className="mockup-card mockup-card--doc2">
            <div className="mockup-card__eyebrow">
              <Sparkles size={13} /> Facture proforma
            </div>
            <div className="mockup-card__total">
              <span className="mockup-card__total-amount">2 810 000</span>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>FCFA</span>
            </div>
            <div className="mockup-card__bars">
              <span className="is-active" />
              <span className="is-active" />
              <span />
              <span className="is-active" />
              <span />
            </div>
            <div className="mockup-card__row" style={{ border: "none", paddingTop: 6 }}>
              <span>TVA (18%) + AIB (1%) calculées</span>
            </div>
          </div>

          <div className="mockup-card mockup-card--doc3">
            <div className="mockup-card__eyebrow">
              <CheckCircle2 size={13} /> Papier entête
            </div>
            <span className="mockup-card__badge">
              <CheckCircle2 size={12} /> Couleur détectée
            </span>
            <div className="mockup-card__row" style={{ marginTop: 10 }}>
              <span>Zone d'écriture</span>
              <span>19.3%</span>
            </div>
            <div className="mockup-card__row">
              <span>Statut</span>
              <span>Validé</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
