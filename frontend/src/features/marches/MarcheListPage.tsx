import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Briefcase, Plus, Trash2 } from "lucide-react";
import { api } from "../../api/client";

interface Company {
  id: number;
  name: string;
}

interface MarcheLine {
  quantity_ordered: string;
  quantity_delivered: number;
}

interface Marche {
  id: number;
  company: number;
  client_name: string;
  object_note: string;
  created_at: string;
  lines: MarcheLine[];
}

function formatDate(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function progressLabel(lines: MarcheLine[]): string {
  if (lines.length === 0) return "Aucun article";
  const totalOrdered = lines.reduce((sum, l) => sum + parseFloat(l.quantity_ordered), 0);
  const totalDelivered = lines.reduce((sum, l) => sum + l.quantity_delivered, 0);
  const pct = totalOrdered > 0 ? Math.round((totalDelivered / totalOrdered) * 100) : 0;
  return `${lines.length} article${lines.length > 1 ? "s" : ""} — ${pct}% livré`;
}

export function MarcheListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const companyFilter = searchParams.get("company") ?? "";
  const queryClient = useQueryClient();

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => api.get("/companies/").then((r) => r.data),
  });

  const { data, isLoading } = useQuery<Marche[]>({
    queryKey: ["marches", companyFilter],
    queryFn: () => api.get(`/marches/${companyFilter ? `?company=${companyFilter}` : ""}`).then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/marches/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["marches"] }),
  });

  function handleDelete(e: React.MouseEvent, marche: Marche) {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm(`Supprimer définitivement le marché "${marche.client_name}" ? Cette action est irréversible.`)) {
      deleteMutation.mutate(marche.id);
    }
  }

  function handleFilterChange(value: string) {
    setSearchParams(value ? { company: value } : {});
  }

  const companyNameById = new Map(companies?.map((c) => [c.id, c.name]));
  const newMarcheHref = companyFilter ? `/marches/new?company=${companyFilter}` : "/marches/new";

  return (
    <div>
      <div className="actions-row" style={{ justifyContent: "space-between", marginTop: 0, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Mes marchés</h1>
        <Link to={newMarcheHref}>
          <button type="button" className="btn-icon-collapsible">
            <Plus size={16} />
            <span className="btn-label">Nouveau marché</span>
          </button>
        </Link>
      </div>

      {companies && companies.length > 1 && (
        <div className="field" style={{ maxWidth: 280 }}>
          <label htmlFor="company-filter">Société</label>
          <select id="company-filter" value={companyFilter} onChange={(e) => handleFilterChange(e.target.value)}>
            <option value="">Toutes</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {isLoading && <p className="loading-state">Chargement...</p>}

      {!isLoading && data?.length === 0 && (
        <div className="empty-state">
          <Briefcase size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
          <p style={{ marginBottom: 8 }}>Aucun marché pour l'instant.</p>
          <Link to={newMarcheHref}>Créer ton premier marché</Link>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="doc-list">
          {data.map((marche) => (
            <li key={marche.id} className="doc-list__row-wrap">
              <Link to={`/marches/${marche.id}`} className="doc-list__item">
                <div className="doc-list__row">
                  <span className="doc-list__company">{marche.client_name}</span>
                  <span className="doc-list__type doc-list__type--bordereau">{progressLabel(marche.lines)}</span>
                </div>
                <div className="doc-list__row doc-list__meta">
                  <span>{companyNameById.get(marche.company) ?? "?"}</span>
                  <span>{marche.object_note || formatDate(marche.created_at)}</span>
                </div>
              </Link>
              <button
                type="button"
                className="doc-list__delete"
                aria-label="Supprimer ce marché"
                onClick={(e) => handleDelete(e, marche)}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
