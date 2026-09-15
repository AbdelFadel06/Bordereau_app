"""Convertit le papier entête fourni (image, PDF ou docx) en image de fond,
sans jamais recréer ou modifier son contenu — juste un changement de format."""
import subprocess
from pathlib import Path
from pdf2image import convert_from_path
from PIL import Image


def convert_letterhead_to_image(source_path: str, output_path: str) -> str:
    ext = Path(source_path).suffix.lower()

    if ext in (".png", ".jpg", ".jpeg", ".webp"):
        Image.open(source_path).convert("RGB").save(output_path, "PNG")

    elif ext == ".pdf":
        pages = convert_from_path(source_path, dpi=200)
        pages[0].save(output_path, "PNG")

    elif ext in (".docx", ".doc"):
        # docx -> pdf (LibreOffice headless) -> image. LibreOffice nomme le
        # fichier converti d'après le fichier SOURCE (pas output_path) :
        # <outdir>/<stem du fichier source>.pdf
        out_dir = Path(output_path).parent
        subprocess.run(
            ["soffice", "--headless", "--convert-to", "pdf",
             source_path, "--outdir", str(out_dir)],
            check=True,
        )
        pdf_path = out_dir / f"{Path(source_path).stem}.pdf"
        pages = convert_from_path(str(pdf_path), dpi=200)
        pages[0].save(output_path, "PNG")
        pdf_path.unlink(missing_ok=True)

    else:
        raise ValueError(f"Format non supporté: {ext}")

    return output_path
