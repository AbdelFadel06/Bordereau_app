from celery import shared_task
from companies.models import Letterhead
from .services.convert_to_image import convert_letterhead_to_image
from .services.zone_detection import detect_content_zone
from .services.color_detection import detect_dominant_color


@shared_task
def process_letterhead(letterhead_id: int):
    """Tâche async lancée à l'upload : convertit le fichier en image de
    fond, détecte automatiquement la zone d'écriture et la couleur
    dominante (utilisée pour styler les documents générés)."""
    letterhead = Letterhead.objects.get(id=letterhead_id)

    output_path = letterhead.source_file.path.rsplit(".", 1)[0] + "_bg.png"
    convert_letterhead_to_image(letterhead.source_file.path, output_path)

    zone = detect_content_zone(output_path)
    header_color = detect_dominant_color(output_path)

    with open(output_path, "rb") as f:
        from django.core.files import File
        letterhead.background_image.save(output_path.split("/")[-1], File(f), save=False)

    letterhead.content_top = zone["content_top"]
    letterhead.content_bottom = zone["content_bottom"]
    letterhead.header_color = header_color
    letterhead.save()
