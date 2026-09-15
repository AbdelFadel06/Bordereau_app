from rest_framework import serializers
from companies.models import Company
from .models import Document, DocumentLine


class DocumentLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentLine
        fields = ["id", "position", "designation", "unit", "reference", "quantity", "unit_price",
                  "is_taxable", "observation"]
        read_only_fields = ["position"]


class DocumentSerializer(serializers.ModelSerializer):
    lines = DocumentLineSerializer(many=True)
    # Laissé vide -> numérotation automatique (DocumentViewSet.perform_create).
    # Saisi -> utilisé tel quel. Validators désactivés ici : l'unicité est
    # vérifiée explicitement dans validate() pour donner un message clair,
    # plutôt que de laisser le validator auto-généré par DRF tourner sur une
    # valeur vide pendant la génération automatique.
    number = serializers.CharField(required=False, allow_blank=True, max_length=50, validators=[])

    class Meta:
        model = Document
        fields = ["id", "company", "doc_type", "number", "issued_at", "issued_place",
                  "client", "object_note", "signatory_name", "status", "generated_pdf", "lines", "created_at"]
        read_only_fields = ["generated_pdf", "status"]
        # Sans ça, DRF génère automatiquement un UniqueTogetherValidator à
        # partir de la contrainte du modèle, qui force `number` à être
        # obligatoire (il a besoin des 3 champs pour vérifier le triplet) —
        # ça casse la génération automatique du numéro. L'unicité est de
        # toute façon vérifiée à la main dans validate() ci-dessous, avec un
        # message plus clair, et la contrainte DB reste le filet de sécurité.
        validators = []

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            self.fields["company"].queryset = Company.objects.filter(owner=request.user)

    def validate(self, attrs):
        number = (attrs.get("number") or "").strip()
        if number:
            company = attrs.get("company", getattr(self.instance, "company", None))
            doc_type = attrs.get("doc_type", getattr(self.instance, "doc_type", None))
            existing = Document.objects.filter(company=company, doc_type=doc_type, number=number)
            if self.instance is not None:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError(
                    {"number": "Ce numéro existe déjà pour ce type de document et cette société."}
                )
        attrs["number"] = number
        return attrs

    def create(self, validated_data):
        lines_data = validated_data.pop("lines")
        document = Document.objects.create(**validated_data)
        self._sync_lines(document, lines_data)
        return document

    def update(self, instance, validated_data):
        lines_data = validated_data.pop("lines", None)
        # Un numéro laissé vide en édition ne doit pas effacer le numéro
        # existant (le champ est juste pré-rempli, pas retapé à chaque fois).
        if not validated_data.get("number"):
            validated_data.pop("number", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if lines_data is not None:
            instance.lines.all().delete()
            self._sync_lines(instance, lines_data)
        return instance

    def _sync_lines(self, document, lines_data):
        for position, line in enumerate(lines_data, start=1):
            DocumentLine.objects.create(document=document, position=position, **line)
