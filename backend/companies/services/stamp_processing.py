"""Transforme la photo/scan d'un cachet (fond blanc/papier) en PNG à fond
transparent, prêt à être superposé sur un document généré."""
from io import BytesIO

import numpy as np
from django.core.files.base import ContentFile
from PIL import Image, ImageOps


def _remove_light_background(image: Image.Image, low: int = 190, high: int = 245) -> Image.Image:
    """Rend transparent tout ce qui ressemble à un fond clair (le papier),
    en gardant opaque l'encre, quelle que soit sa couleur. Un pixel est jugé
    "fond" si son canal le plus sombre est clair : le papier est clair sur
    les 3 canaux, alors qu'une encre colorée (même bleue) a toujours un
    canal nettement plus sombre que le papier. "low"/"high" définissent une
    transition progressive pour éviter un bord crénelé.
    """
    rgba = image.convert("RGBA")
    arr = np.array(rgba).astype(np.float32)
    darkest_channel = arr[..., :3].min(axis=2)
    alpha = np.clip((high - darkest_channel) / (high - low), 0.0, 1.0) * 255
    arr[..., 3] = np.minimum(arr[..., 3], alpha)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def _crop_to_content(image: Image.Image, padding_ratio: float = 0.06) -> Image.Image:
    """Recadre autour du contenu opaque (le cachet lui-même) pour ne pas
    garder toute la marge blanche de la photo d'origine."""
    alpha = np.array(image.split()[-1])
    ys, xs = np.where(alpha > 10)
    if len(xs) == 0 or len(ys) == 0:
        return image
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    pad_x = int((x1 - x0) * padding_ratio)
    pad_y = int((y1 - y0) * padding_ratio)
    box = (
        max(0, x0 - pad_x),
        max(0, y0 - pad_y),
        min(image.width, x1 + pad_x + 1),
        min(image.height, y1 + pad_y + 1),
    )
    return image.crop(box)


def process_stamp_upload(uploaded_file) -> ContentFile:
    """Point d'entrée : fichier uploadé -> PNG fond transparent recadré,
    prêt à assigner à un ImageField."""
    image = Image.open(uploaded_file)
    image = ImageOps.exif_transpose(image)
    image = _remove_light_background(image)
    image = _crop_to_content(image)

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return ContentFile(buffer.getvalue(), name="stamp.png")
