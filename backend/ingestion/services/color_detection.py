"""Détecte la couleur dominante d'un papier entête (typiquement celle du
logo/bandeau), pour l'appliquer automatiquement au style des documents
générés — sans que l'utilisateur ait à choisir une couleur manuellement.

Heuristique simple : on réduit l'image à une palette de quelques couleurs,
on écarte le blanc (fond) et les tons proches du gris/noir (texte), et on
garde la couleur restante la plus fréquente."""
from PIL import Image

DEFAULT_COLOR = "#333333"


def _is_near_white_or_gray(r: int, g: int, b: int) -> bool:
    if r > 235 and g > 235 and b > 235:
        return True
    channel_spread = max(r, g, b) - min(r, g, b)
    if channel_spread < 15:  # gris/noir/blanc : pas de teinte marquée
        return True
    return False


def detect_dominant_color(image_path: str, default: str = DEFAULT_COLOR) -> str:
    img = Image.open(image_path).convert("RGB")
    img.thumbnail((300, 300))
    quantized = img.quantize(colors=16, method=Image.MEDIANCUT)
    palette = quantized.getpalette()
    color_counts = sorted(quantized.getcolors(), reverse=True)

    for _count, index in color_counts:
        r, g, b = palette[index * 3: index * 3 + 3]
        if not _is_near_white_or_gray(r, g, b):
            return f"#{r:02x}{g:02x}{b:02x}"

    return default


def readable_text_color(hex_color: str) -> str:
    """Noir ou blanc selon la luminance de hex_color, pour rester lisible
    quelle que soit la couleur détectée."""
    hex_color = hex_color.lstrip("#")
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
    luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return "#000000" if luminance > 0.6 else "#ffffff"


def with_opacity(hex_color: str, alpha: float) -> str:
    """hex_color en rgba(), pour un fond légèrement teinté (ex: en-têtes de
    section) plutôt qu'un aplat plein réservé au header du tableau."""
    hex_color = hex_color.lstrip("#")
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
    return f"rgba({r}, {g}, {b}, {alpha})"
