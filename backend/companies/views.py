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

    @action(detail=True, methods=["patch"])
    def adjust_letterhead(self, request, pk=None):
        """Enregistre la zone éditable ajustée manuellement (content_top /
        content_bottom / header_mask_top, en % de la hauteur de page) et
        valide dans la foulée — un seul geste : on ajuste, on confirme.
        content_bottom et header_mask_top à null retirent leur masquage
        respectif (pied de page / élément imprimé entre le logo et le
        contenu)."""
        company = self.get_object()
        letterhead = getattr(company, "letterhead", None)
        if not letterhead:
            return Response(
                {"detail": "Cette société n'a pas encore de papier entête à ajuster."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        content_top = request.data.get("content_top")
        if content_top is None:
            return Response({"detail": "content_top est requis."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            letterhead.content_top = float(content_top)
            content_bottom = request.data.get("content_bottom")
            letterhead.content_bottom = float(content_bottom) if content_bottom is not None else None
            header_mask_top = request.data.get("header_mask_top")
            letterhead.header_mask_top = float(header_mask_top) if header_mask_top is not None else None
        except (TypeError, ValueError):
            return Response({"detail": "Valeurs invalides."}, status=status.HTTP_400_BAD_REQUEST)
        letterhead.is_validated = True
        letterhead.save(update_fields=["content_top", "content_bottom", "header_mask_top", "is_validated"])
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
