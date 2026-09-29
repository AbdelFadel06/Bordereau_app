from rest_framework import serializers
from .models import Company, Letterhead


class LetterheadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Letterhead
        fields = ["id", "source_file", "background_image", "content_top", "content_bottom",
                  "header_color", "is_validated"]
        read_only_fields = ["background_image", "header_color"]  # générés par la tâche de conversion


class CompanySerializer(serializers.ModelSerializer):
    letterhead = LetterheadSerializer(read_only=True)

    class Meta:
        model = Company
        fields = ["id", "name", "letterhead", "stamp_image", "created_at"]
        read_only_fields = ["stamp_image"]  # géré par l'action stamp/, pas par un update direct
