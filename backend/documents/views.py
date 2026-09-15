from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import FileResponse
from .models import Document, DocumentLine
from .serializers import DocumentSerializer
from .services.pdf_render import render_document_pdf


def _next_number(company, doc_type):
    """Numéro suivant pour cette société + ce type de document, en
    continuant depuis le dernier document CRÉÉ (pas le maximum numérique —
    voir HANDOFF.md pour la nuance si un numéro manuel a été inséré)."""
    last_number = (
        Document.objects.select_for_update()
        .filter(company=company, doc_type=doc_type)
        .order_by("-id")
        .values_list("number", flat=True)
        .first()
    )
    return str(int(last_number) + 1) if last_number and last_number.isdigit() else "1"


class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Document.objects.filter(company__owner=self.request.user)
        company_id = self.request.query_params.get("company")
        if company_id:
            queryset = queryset.filter(company_id=company_id)
        return queryset

    def perform_create(self, serializer):
        # Numéro fourni par le client (saisie manuelle) : on le garde tel
        # quel, l'unicité a déjà été vérifiée dans DocumentSerializer.validate.
        if serializer.validated_data.get("number"):
            serializer.save()
            return

        with transaction.atomic():
            number = _next_number(serializer.validated_data["company"], serializer.validated_data["doc_type"])
            serializer.save(number=number)

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        document = self.get_object()
        if not hasattr(document.company, "letterhead"):
            return Response(
                {"detail": "Cette société n'a pas encore de papier entête."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Document finalisé : on sert la copie archivée telle quelle, jamais
        # régénérée, pour garantir que c'est exactement ce qui a été envoyé —
        # même si le document ou le papier entête ont changé depuis.
        if document.status == Document.Status.FINAL and document.generated_pdf:
            return FileResponse(
                document.generated_pdf.open("rb"),
                as_attachment=True,
                filename=f"{document.doc_type}-{document.number}.pdf",
            )
        pdf_file = render_document_pdf(document)
        return FileResponse(pdf_file, as_attachment=True, filename=f"{document.doc_type}-{document.number}.pdf")

    @action(detail=True, methods=["post"])
    def finalize(self, request, pk=None):
        """Fige le PDF actuel comme copie archivée du document (ex: la
        facture réellement envoyée au client) et passe le statut à
        'final'. Toute modification ultérieure du document repasse le
        statut à 'draft' (voir DocumentSerializer.update)."""
        document = self.get_object()
        if not hasattr(document.company, "letterhead"):
            return Response(
                {"detail": "Cette société n'a pas encore de papier entête."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pdf_bytes = render_document_pdf(document).getvalue()
        document.generated_pdf.save(
            f"{document.doc_type}-{document.number}.pdf", ContentFile(pdf_bytes), save=False
        )
        document.status = Document.Status.FINAL
        document.save()
        return Response(DocumentSerializer(document, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """Crée un nouveau document (brouillon) à partir de celui-ci : mêmes
        client/lignes/etc., nouveau numéro auto-généré, date du jour."""
        original = self.get_object()
        with transaction.atomic():
            number = _next_number(original.company, original.doc_type)
            copy = Document.objects.create(
                company=original.company,
                doc_type=original.doc_type,
                number=number,
                issued_at=timezone.localdate(),
                issued_place=original.issued_place,
                client=original.client,
                object_note=original.object_note,
                signatory_name=original.signatory_name,
            )
            for line in original.lines.all():
                DocumentLine.objects.create(
                    document=copy,
                    position=line.position,
                    designation=line.designation,
                    unit=line.unit,
                    reference=line.reference,
                    quantity=line.quantity,
                    unit_price=line.unit_price,
                    is_taxable=line.is_taxable,
                    observation=line.observation,
                )
        return Response(
            DocumentSerializer(copy, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )
