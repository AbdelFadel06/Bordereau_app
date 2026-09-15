from django.db import models
from companies.models import Company


class Article(models.Model):
    """Catalogue d'articles réutilisables d'une société, pour ne pas
    retaper les mêmes désignations à chaque document."""
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="articles")
    designation = models.CharField(max_length=255)
    default_unit = models.CharField(max_length=50, blank=True)
    default_reference = models.CharField(max_length=100, blank=True)
    default_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return self.designation
