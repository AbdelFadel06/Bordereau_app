import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";

interface Letterhead {
  background_image: string;
  content_top: number;
  content_bottom: number | null;
  is_validated: boolean;
}

interface Company {
  id: number;
  name: string;
  letterhead: Letterhead | null;
}

type DragTarget = "top" | "bottom" | null;

/**
 * Ajuste manuellement la zone éditable détectée automatiquement sur le
 * papier entête : où commence le contenu (content_top), et où s'arrête-t-il
 * avant un éventuel pied de page déjà imprimé sur l'entête (content_bottom).
 * Nécessaire quand la détection auto ne pousse pas assez bas (ex: date déjà
 * imprimée sur l'entête, qui se retrouve alors dupliquée avec celle ajoutée
 * par l'app) — remplace l'ancien bouton "Valider" à l'aveugle.
 */
export function LetterheadZonePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [contentTop, setContentTop] = useState<number | null>(null);
  const [contentBottom, setContentBottom] = useState<number | null>(null);
  const [hasFooterMask, setHasFooterMask] = useState(false);
  const [drag, setDrag] = useState<DragTarget>(null);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const { data: company } = useQuery<Company>({
    queryKey: ["company", companyId],
    queryFn: () => api.get(`/companies/${companyId}/`).then((r) => r.data),
    enabled: Boolean(companyId),
    // Le fond + la zone détectée arrivent en différé (tâche Celery après
    // l'upload) — on patiente tant que l'image n'est pas encore là.
    refetchInterval: (query) => (query.state.data?.letterhead?.background_image ? false : 1500),
  });

  const letterhead = company?.letterhead;
  const ready = Boolean(letterhead?.background_image);

  useEffect(() => {
    if (!ready || !letterhead || initialized.current) return;
    initialized.current = true;
    setContentTop(letterhead.content_top);
    setContentBottom(letterhead.content_bottom);
    setHasFooterMask(letterhead.content_bottom !== null);
  }, [ready, letterhead]);

  function clampPercent(value: number): number {
    return Math.min(100, Math.max(0, value));
  }

  function percentFromPointer(clientY: number): number {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clampPercent(((clientY - rect.top) / rect.height) * 100);
  }

  function handlePointerDown(target: DragTarget) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      setDrag(target);
    };
  }

  useEffect(() => {
    if (!drag) return;

    function handleMove(e: PointerEvent) {
      const pct = percentFromPointer(e.clientY);
      if (drag === "top") {
        setContentTop(Math.min(pct, (contentBottom ?? 100) - 2));
      } else {
        setContentBottom(Math.max(pct, (contentTop ?? 0) + 2));
      }
    }
    function handleUp() {
      setDrag(null);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, contentTop, contentBottom]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/companies/${companyId}/adjust_letterhead/`, {
        content_top: contentTop,
        content_bottom: hasFooterMask ? contentBottom : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      navigate("/companies", { replace: true });
    },
    onError: () => setError("Échec de l'enregistrement. Réessaie."),
  });

  function toggleFooterMask(checked: boolean) {
    setHasFooterMask(checked);
    if (checked && contentBottom === null) {
      setContentBottom(Math.max((contentTop ?? 0) + 10, 85));
    }
  }

  if (!ready || contentTop === null) {
    return (
      <div className="card" style={{ maxWidth: 480 }}>
        <h1>Analyse du papier entête...</h1>
        <p className="page-intro">
          Détection automatique de la zone éditable en cours — ça prend quelques secondes.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Ajuste la zone éditable</h1>
      <p className="page-intro">
        Fais glisser les lignes pour définir où commence le contenu (et, si besoin, où s'arrête un pied de page déjà
        imprimé sur l'entête). La zone verte est celle où tes documents s'écriront.
      </p>

      <div
        ref={containerRef}
        className="letterhead-zone__frame"
        style={{ backgroundImage: `url(${letterhead!.background_image})` }}
      >
        <div className="letterhead-zone__mask" style={{ top: 0, height: `${contentTop}%` }} />
        {hasFooterMask && contentBottom !== null && (
          <div className="letterhead-zone__mask" style={{ top: `${contentBottom}%`, bottom: 0 }} />
        )}
        <div
          className="letterhead-zone__writable"
          style={{ top: `${contentTop}%`, height: `${(hasFooterMask ? contentBottom! : 100) - contentTop}%` }}
        />

        <div
          className="letterhead-zone__handle"
          style={{ top: `${contentTop}%` }}
          onPointerDown={handlePointerDown("top")}
        >
          <span>Début du contenu</span>
        </div>
        {hasFooterMask && contentBottom !== null && (
          <div
            className="letterhead-zone__handle letterhead-zone__handle--bottom"
            style={{ top: `${contentBottom}%` }}
            onPointerDown={handlePointerDown("bottom")}
          >
            <span>Pied de page imprimé</span>
          </div>
        )}
      </div>

      <label className="field-checkbox" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={hasFooterMask} onChange={(e) => toggleFooterMask(e.target.checked)} />
        Cet entête a un pied de page déjà imprimé à masquer
      </label>

      {error && <p role="alert">{error}</p>}

      <div className="actions-row">
        <button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? "Enregistrement..." : "Valider cette zone"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => navigate("/companies")}>
          Annuler
        </button>
      </div>
    </div>
  );
}
