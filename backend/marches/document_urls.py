"""Préfixe URL séparé (api/marche-documents/) plutôt que nested sous
api/marches/ : un MarcheDocumentViewSet enregistré à côté de MarcheViewSet
(préfixe vide "") dans le même routeur créerait une ambiguïté — une requête
vers .../marches/documents/ pourrait matcher le pattern <pk>/ de
MarcheViewSet avant d'atteindre celui-ci."""
from rest_framework.routers import DefaultRouter
from .views import MarcheDocumentViewSet

router = DefaultRouter()
router.register("", MarcheDocumentViewSet, basename="marche-document")

urlpatterns = router.urls
