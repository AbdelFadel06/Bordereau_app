"""Génère le PDF final : le papier entête original en fond de page,
le contenu du document (métadonnées + tableau + pied) positionné dans la
zone détectée (content_top / content_bottom du Letterhead)."""
import io
from django.template.loader import render_to_string
from weasyprint import HTML
from ingestion.services.color_detection import readable_text_color, with_opacity
from .proforma_calc import compute_proforma_totals


def _background_url(background_image):
    """URL utilisable par WeasyPrint pour l'image de fond. `.url` seul est
    une URL relative (ex: "/media/...") que WeasyPrint ne peut pas résoudre
    sans base_url : on passe directement le chemin fichier local en file://."""
    if not background_image:
        return None
    try:
        return f"file://{background_image.path}"
    except NotImplementedError:
        # Storage distant (S3/R2...) : .path n'existe pas, on retombe sur l'URL
        return background_image.url


def _letterhead_context(letterhead):
    return {
        "background_url": _background_url(letterhead.background_image),
        # Formaté en str ici pour éviter la localisation du template (Django
        # rend {{ 19.3 }} en "19,3" en fr-fr — virgule invalide en CSS, "top:
        # 19,3%" est alors ignoré silencieusement et retombe à sa position
        # par défaut, d'où le chevauchement avec l'entête).
        "content_top": f"{letterhead.content_top:.1f}",
        # Démarre un peu avant content_bottom : la détection tombe pile sur
        # le bord d'un élément imprimé (ex: bordure d'un encadré), qui reste
        # visible en un fin liseré sinon.
        "footer_mask_top": f"{max(letterhead.content_bottom - 2.0, 0):.1f}" if letterhead.content_bottom is not None else None,
        "header_color": letterhead.header_color,
        "header_text_color": readable_text_color(letterhead.header_color),
    }


def render_document_pdf(document):
    letterhead = document.company.letterhead
    context = {"document": document, **_letterhead_context(letterhead)}

    if document.doc_type == "proforma":
        template = "documents/document_pdf_proforma.html"
        context.update(compute_proforma_totals(document.lines.all()))
        context["group_header_color"] = with_opacity(letterhead.header_color, 0.3)
    else:
        template = "documents/document_pdf.html"
        context["lines"] = document.lines.all()

    html_string = render_to_string(template, context)
    pdf_bytes = HTML(string=html_string).write_pdf()
    return io.BytesIO(pdf_bytes)
