from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from .models import Company
from .serializers import CompanySerializer
from .services.stamp_processing import process_stamp_upload


class CompanyViewSet(viewsets.ModelViewSet):
    serializer_class = CompanySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Company.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=["post"])
    def validate_letterhead(self, request, pk=None):
        """Confirme que le papier entête (zone détectée automatiquement)
        convient — débloque la création de documents pour cette société.
        Étape minimale en attendant l'écran d'ajustement manuel de la zone."""
        company = self.get_object()
        letterhead = getattr(company, "letterhead", None)
        if not letterhead:
            return Response(
                {"detail": "Cette société n'a pas encore de papier entête à valider."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        letterhead.is_validated = True
        letterhead.save(update_fields=["is_validated"])
        return Response(CompanySerializer(company).data)

    @action(detail=True, methods=["post", "delete"], parser_classes=[MultiPartParser])
    def stamp(self, request, pk=None):
        """Cachet/signature apposé automatiquement sur les documents générés.
        POST (multipart, champ "file") : upload/remplace, fond clair retiré
        automatiquement. DELETE : retire le cachet."""
        company = self.get_object()
        if request.method == "DELETE":
            company.stamp_image.delete(save=False)
            company.stamp_image = None
            company.save(update_fields=["stamp_image"])
            return Response(CompanySerializer(company).data)

        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "Aucun fichier reçu."}, status=status.HTTP_400_BAD_REQUEST)
        company.stamp_image.delete(save=False)
        company.stamp_image.save("stamp.png", process_stamp_upload(uploaded), save=True)
        return Response(CompanySerializer(company).data)
