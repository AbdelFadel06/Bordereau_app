import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";

interface Letterhead {
  background_image: string;
  content_top: number;
  content_bottom: number | null;
  header_mask_top: number | null;
  is_validated: boolean;
}

interface Company {
  id: number;
  name: string;
  letterhead: Letterhead | null;
}

type DragTarget = "headerMask" | "top" | "bottom" | null;

/**
 * Ajuste manuellement la zone éditable détectée automatiquement sur le
 * papier entête. Trois limites possibles, de haut en bas :
 * header_mask_top (optionnel) -> content_top -> content_bottom (optionnel).
 * Important : déplacer content_top ne fait que déplacer où commence le
 * contenu de l'app, ça ne masque RIEN de ce qui est déjà imprimé au-dessus
 * (ex: une date placeholder) — seul le masque d'en-tête (header_mask_top,
 * comme le masque de pied de page existant) peut vraiment la faire
 * disparaître en la recouvrant de blanc.
 */
export function LetterheadZonePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [contentTop, setContentTop] = useState<number | null>(null);
  const [contentBottom, setContentBottom] = useState<number | null>(null);
  const [headerMaskTop, setHeaderMaskTop] = useState<number | null>(null);
  const [hasFooterMask, setHasFooterMask] = useState(false);
  const [hasHeaderMask, setHasHeaderMask] = useState(false);
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
    setHeaderMaskTop(letterhead.header_mask_top);
    setHasHeaderMask(letterhead.header_mask_top !== null);
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
      if (drag === "headerMask") {
        setHeaderMaskTop(Math.min(pct, (contentTop ?? 100) - 2));
      } else if (drag === "top") {
        const next = Math.min(pct, (contentBottom ?? 100) - 2);
        setContentTop(hasHeaderMask ? Math.max(next, (headerMaskTop ?? 0) + 2) : next);
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
  }, [drag, contentTop, contentBottom, headerMaskTop, hasHeaderMask]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/companies/${companyId}/adjust_letterhead/`, {
        content_top: contentTop,
        content_bottom: hasFooterMask ? contentBottom : null,
        header_mask_top: hasHeaderMask ? headerMaskTop : null,
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

  function toggleHeaderMask(checked: boolean) {
    setHasHeaderMask(checked);
    if (checked && headerMaskTop === null) {
      setHeaderMaskTop(Math.max((contentTop ?? 10) - 8, 0));
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
        Fais glisser les lignes pour définir où commence le contenu. La zone verte est celle où tes documents
        s'écriront ; la zone rouge sera recouverte de blanc (utile pour cacher un élément déjà imprimé sur l'entête,
        comme une date). Ailleurs, l'entête reste affiché tel quel.
      </p>

      <div
        ref={containerRef}
        className="letterhead-zone__frame"
        style={{ backgroundImage: `url(${letterhead!.background_image})` }}
      >
        {hasHeaderMask && headerMaskTop !== null && (
          <div
            className="letterhead-zone__mask"
            style={{ top: `${headerMaskTop}%`, height: `${contentTop - headerMaskTop}%` }}
          />
        )}
        {hasFooterMask && contentBottom !== null && (
          <div className="letterhead-zone__mask" style={{ top: `${contentBottom}%`, bottom: 0 }} />
        )}
        <div
          className="letterhead-zone__writable"
          style={{ top: `${contentTop}%`, height: `${(hasFooterMask ? contentBottom! : 100) - contentTop}%` }}
        />

        {hasHeaderMask && headerMaskTop !== null && (
          <div
            className="letterhead-zone__handle"
            style={{ top: `${headerMaskTop}%` }}
            onPointerDown={handlePointerDown("headerMask")}
          >
            <span>Début du masque</span>
          </div>
        )}
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
        <input type="checkbox" checked={hasHeaderMask} onChange={(e) => toggleHeaderMask(e.target.checked)} />
        Un élément déjà imprimé entre le logo et le contenu doit être caché (ex: une date)
      </label>
      <label className="field-checkbox" style={{ marginTop: 6 }}>
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
