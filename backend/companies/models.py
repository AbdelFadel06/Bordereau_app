from django.conf import settings
from django.db import models


class Company(models.Model):
    """Une société de l'utilisateur. On ne stocke QUE ce qui n'est pas déjà
    visible sur le papier entête (le nom peut être redondant, gardé pour
    affichage dans l'UI / recherche)."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="companies")
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Letterhead(models.Model):
    """Le papier entête original de l'entreprise, utilisé tel quel comme
    fond de page. Rien n'est redessiné : source_file est le document fourni
    par l'utilisateur, background_image est sa conversion directe en image
    pour l'affichage/impression."""
    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name="letterhead")
    source_file = models.FileField(upload_to="letterheads/source/")
    background_image = models.ImageField(upload_to="letterheads/background/", blank=True)

    # Zone d'écriture détectée automatiquement (en % de la hauteur de page)
    content_top = models.FloatField(help_text="Limite haute de la zone éditable, en % de la page")
    content_bottom = models.FloatField(null=True, blank=True, help_text="Limite basse si pied de page imprimé")

    # Couleur dominante détectée automatiquement sur l'entête (ex: le bleu du
    # logo) — réutilisée pour styler les documents générés (fond du header
    # de tableau) sans que l'utilisateur ait à la choisir manuellement.
    header_color = models.CharField(max_length=7, default="#eeeeee", help_text="Couleur dominante détectée, en hexadécimal")

    is_validated = models.BooleanField(default=False)  # True une fois l'utilisateur a confirmé/ajusté la zone
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Entête de {self.company.name}"
