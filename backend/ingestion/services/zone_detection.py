"""Détecte automatiquement la zone d'écriture disponible sur un papier
entête : où s'arrête le contenu imprimé en haut (content_top), et où
commence un éventuel pied de page imprimé en bas (content_bottom).

Heuristique simple au démarrage : on scanne les lignes de pixels et on
repère la dernière ligne "non blanche" en partant du haut, avec une marge
de tolérance pour le bruit de scan. Suffisant pour du texte/logo net sur
fond blanc comme dans les exemples analysés ; à affiner avec un vrai modèle
de segmentation si besoin plus tard."""
import numpy as np
from PIL import Image

WHITE_THRESHOLD = 245   # au-delà, un pixel est considéré "blanc"
ROW_INK_RATIO = 0.02    # % de pixels non-blancs pour dire "cette ligne a du contenu"


def _ink_ratio_per_row(gray: np.ndarray) -> np.ndarray:
    ink_mask = gray < WHITE_THRESHOLD
    return ink_mask.mean(axis=1)


def detect_content_zone(image_path: str) -> dict:
    img = Image.open(image_path).convert("L")  # niveaux de gris
    arr = np.array(img)
    height = arr.shape[0]

    row_ink = _ink_ratio_per_row(arr)
    rows_with_content = np.where(row_ink > ROW_INK_RATIO)[0]

    if len(rows_with_content) == 0:
        # rien détecté, zone par défaut raisonnable
        return {"content_top": 15.0, "content_bottom": None}

    top_px = rows_with_content[0]
    bottom_of_header_px = rows_with_content[rows_with_content < height * 0.5].max()

    # Cherche un bloc de contenu isolé dans la moitié basse (pied de page imprimé)
    lower_half_rows = rows_with_content[rows_with_content > height * 0.7]
    content_bottom = None
    if len(lower_half_rows) > 0:
        content_bottom_px = lower_half_rows.min()
        content_bottom = round((content_bottom_px / height) * 100, 1)

    content_top = round(((bottom_of_header_px + 20) / height) * 100, 1)  # +20px de marge

    return {"content_top": content_top, "content_bottom": content_bottom}
