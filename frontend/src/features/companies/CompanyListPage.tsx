import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Plus, RefreshCw, Upload } from "lucide-react";
import { api } from "../../api/client";

interface Company {
  id: number;
  name: string;
  letterhead: { is_validated: boolean } | null;
}

function LetterheadStatus({ letterhead }: { letterhead: Company["letterhead"] }) {
  if (!letterhead) {
    return (
      <span className="status-badge status-badge--missing">
        <AlertTriangle size={11} /> Aucun papier entête
      </span>
    );
  }
  if (!letterhead.is_validated) {
    return (
      <span className="status-badge status-badge--pending">
        <AlertTriangle size={11} /> En attente de validation
      </span>
    );
  }
  return (
    <span className="status-badge status-badge--ok">
      <CheckCircle2 size={11} /> Papier entête validé
    </span>
  );
}

export function CompanyListPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => api.get("/companies/").then((r) => r.data),
  });

  const validateMutation = useMutation({
    mutationFn: (companyId: number) => api.post(`/companies/${companyId}/validate_letterhead/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["companies"] }),
  });

  return (
    <div>
      <div className="actions-row" style={{ justifyContent: "space-between", marginTop: 0, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Mes entreprises</h1>
        <Link to="/company/new">
          <button type="button" className="btn-icon-collapsible">
            <Plus size={16} />
            <span className="btn-label">Nouvelle entreprise</span>
          </button>
        </Link>
      </div>

      {isLoading && <p className="loading-state">Chargement...</p>}

      {!isLoading && (!data || data.length === 0) && (
        <div className="empty-state">
          <Building2 size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
          <p style={{ marginBottom: 8 }}>Aucune entreprise pour l'instant.</p>
          <Link to="/company/new">Créer ta première entreprise</Link>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="company-grid">
          {data.map((company) => (
            <div className="card" key={company.id}>
              <div className="company-card__name">{company.name}</div>

              <div className="company-card__status-row">
                <LetterheadStatus letterhead={company.letterhead} />
                {!company.letterhead && (
                  <Link to={`/onboarding/${company.id}`}>
                    <button type="button" className="btn-secondary btn-compact">
                      <Upload size={13} /> Ajouter
                    </button>
                  </Link>
                )}
                {company.letterhead && (
                  <Link to={`/onboarding/${company.id}`}>
                    <button type="button" className="btn-secondary btn-compact">
                      <RefreshCw size={13} /> Remplacer
                    </button>
                  </Link>
                )}
              </div>

              {company.letterhead && !company.letterhead.is_validated && (
                <p className="field-hint" style={{ marginTop: 8 }}>
                  Le fond de page a été généré automatiquement à partir de ton fichier. Valide-le pour pouvoir créer
                  des documents avec cette société.
                </p>
              )}

              <div className="company-card__actions">
                <Link to={`/documents?company=${company.id}`}>
                  <button type="button" className="btn-accent">
                    Voir ses documents <ArrowRight size={14} />
                  </button>
                </Link>
                {company.letterhead && !company.letterhead.is_validated && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => validateMutation.mutate(company.id)}
                    disabled={validateMutation.isPending}
                  >
                    <CheckCircle2 size={14} /> Valider
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
