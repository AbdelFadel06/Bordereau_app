from django.db import models
from companies.models import Company


class Marche(models.Model):
    """Un marché/contrat avec un client : regroupe les documents de
    référence (contrat signé, spécifications...) et les quantités
    commandées, pour suivre au fil des bordereaux ce qui a déjà été livré
    et ce qu'il reste à livrer."""
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="marches")
    client_name = models.CharField(max_length=255)
    object_note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Marché {self.client_name}"


class MarcheDocument(models.Model):
    """Document de référence du marché (contrat, spécifications...) : un
    simple fichier labellisé, distinct des bordereaux/factures générés par
    l'app."""
    marche = models.ForeignKey(Marche, on_delete=models.CASCADE, related_name="documents")
    label = models.CharField(max_length=255)
    file = models.FileField(upload_to="marches/documents/")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]


class MarcheLine(models.Model):
    """Un article commandé dans le marché avec la quantité totale prévue —
    les lignes des bordereaux liés au marché livrent contre ces lignes
    (DocumentLine.marche_line), ce qui permet de calculer automatiquement
    les quantités déjà livrées et restantes."""
    marche = models.ForeignKey(Marche, on_delete=models.CASCADE, related_name="lines")
    designation = models.CharField(max_length=255)
    unit = models.CharField(max_length=50, blank=True)
    reference = models.CharField(max_length=100, blank=True)
    quantity_ordered = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["id"]
