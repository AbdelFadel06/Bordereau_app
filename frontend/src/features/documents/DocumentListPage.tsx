import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Inbox, Plus } from "lucide-react";
import { api } from "../../api/client";
import { docTypeShortLabel } from "./docTypes";

interface Company {
  id: number;
  name: string;
}

function formatDate(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function DocumentListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const companyFilter = searchParams.get("company") ?? "";

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => api.get("/companies/").then((r) => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["documents", companyFilter],
    queryFn: () =>
      api.get(`/documents/${companyFilter ? `?company=${companyFilter}` : ""}`).then((r) => r.data),
  });

  const companyNameById = useMemo(() => {
    const map = new Map<number, string>();
    companies?.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [companies]);

  const sortedDocuments = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a: any, b: any) => (a.issued_at < b.issued_at ? 1 : -1));
  }, [data]);

  function handleFilterChange(value: string) {
    if (value) {
      setSearchParams({ company: value });
    } else {
      setSearchParams({});
    }
  }

  const newDocumentHref = companyFilter ? `/documents/new?company=${companyFilter}` : "/documents/new";

  return (
    <div>
      <div className="actions-row" style={{ justifyContent: "space-between", marginTop: 0, marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Mes documents</h1>
        <Link to={newDocumentHref}>
          <button type="button" className="btn-icon-collapsible">
            <Plus size={16} />
            <span className="btn-label">Nouveau document</span>
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

      {!isLoading && sortedDocuments.length === 0 && (
        <div className="empty-state">
          <Inbox size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
          <p style={{ marginBottom: 8 }}>Aucun document pour l'instant.</p>
          <Link to={newDocumentHref}>Créer ton premier document</Link>
        </div>
      )}

      {sortedDocuments.length > 0 && (
        <ul className="doc-list">
          {sortedDocuments.map((doc: any) => (
            <li key={doc.id}>
              <Link to={`/documents/${doc.id}`} className="doc-list__item">
                <div className="doc-list__row">
                  <span className="doc-list__company">{companyNameById.get(doc.company) ?? "?"}</span>
                  <span className={`doc-list__type doc-list__type--${doc.doc_type}`}>
                    {docTypeShortLabel(doc.doc_type)}
                  </span>
                </div>
                <div className="doc-list__row doc-list__meta">
                  <span>N°{doc.number}</span>
                  <span>{formatDate(doc.created_at)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
