from django.db import models
from companies.models import Company


class Document(models.Model):
    class DocType(models.TextChoices):
        BORDEREAU = "bordereau", "Bordereau de livraison"
        PROVISOIRE = "provisoire", "Bordereau provisoire"
        PROFORMA = "proforma", "Facture proforma"

    class Status(models.TextChoices):
        DRAFT = "draft", "Brouillon"
        FINAL = "final", "Finalisé"

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField(max_length=20, choices=DocType.choices)
    # Auto-incrémenté par société + type (DocumentViewSet.perform_create) si
    # laissé vide, sinon saisi manuellement par l'utilisateur. Unique par
    # société + type pour éviter les doublons dans les deux cas.
    number = models.CharField(max_length=50)
    issued_at = models.DateField()
    issued_place = models.CharField(max_length=120, blank=True)  # ex: "Parakou"
    client = models.CharField(max_length=255)
    object_note = models.CharField(max_length=255, blank=True)  # champ "OBJET"
    signatory_name = models.CharField(max_length=255, blank=True)  # nom du gérant/directrice, facultatif
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    generated_pdf = models.FileField(upload_to="documents/pdf/", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["company", "doc_type", "number"], name="unique_number_per_company_doc_type")
        ]

    def __str__(self):
        return f"{self.get_doc_type_display()} n°{self.number}"


class DocumentLine(models.Model):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="lines")
    position = models.PositiveIntegerField()
    designation = models.CharField(max_length=255)
    unit = models.CharField(max_length=50, blank=True)
    reference = models.CharField(max_length=100, blank=True)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    is_taxable = models.BooleanField(default=False)  # facture proforma : TVA 18% incluse dans unit_price si True
    observation = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["position"]
