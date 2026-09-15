from rest_framework import views, permissions, status
from rest_framework.response import Response
from companies.models import Company, Letterhead
from companies.serializers import LetterheadSerializer
from .tasks import process_letterhead


class LetterheadUploadView(views.APIView):
    """Upload du papier entête original -> déclenche la conversion +
    détection de zone en tâche async."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, company_id):
        company = Company.objects.get(id=company_id, owner=request.user)
        letterhead, _ = Letterhead.objects.update_or_create(
            company=company,
            # is_validated remis à False à chaque (ré)upload : un nouveau
            # fichier veut dire une nouvelle zone détectée, donc une nouvelle
            # validation à faire — même si l'entête précédent l'était déjà.
            defaults={"source_file": request.FILES["file"], "content_top": 15.0, "is_validated": False},
        )
        process_letterhead.delay(letterhead.id)
        return Response(LetterheadSerializer(letterhead).data, status=status.HTTP_202_ACCEPTED)
