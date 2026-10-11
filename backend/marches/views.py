from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from .models import Marche, MarcheDocument
from .serializers import MarcheSerializer, MarcheDocumentSerializer


class MarcheViewSet(viewsets.ModelViewSet):
    serializer_class = MarcheSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Marche.objects.filter(company__owner=self.request.user)
        company_id = self.request.query_params.get("company")
        if company_id:
            queryset = queryset.filter(company_id=company_id)
        return queryset

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser])
    def documents(self, request, pk=None):
        """Ajoute un document de référence (contrat, specs...) au marché —
        label + fichier (PDF/Word), pas de traitement particulier."""
        marche = self.get_object()
        label = (request.data.get("label") or "").strip()
        uploaded = request.FILES.get("file")
        if not label or not uploaded:
            return Response({"detail": "Libellé et fichier requis."}, status=status.HTTP_400_BAD_REQUEST)
        doc = MarcheDocument.objects.create(marche=marche, label=label, file=uploaded)
        return Response(MarcheDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)


class MarcheDocumentViewSet(mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Seule la suppression d'un document de référence passe par ici —
    l'ajout se fait via MarcheViewSet.documents (besoin du marché parent)."""
    serializer_class = MarcheDocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return MarcheDocument.objects.filter(marche__company__owner=self.request.user)
