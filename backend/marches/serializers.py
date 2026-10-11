from django.db.models import Sum
from rest_framework import serializers
from companies.models import Company
from .models import Marche, MarcheDocument, MarcheLine


class MarcheDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarcheDocument
        fields = ["id", "marche", "label", "file", "uploaded_at"]
        read_only_fields = ["uploaded_at"]


class MarcheLineSerializer(serializers.ModelSerializer):
    # Permet de ré-identifier une ligne existante lors d'une mise à jour
    # imbriquée (voir MarcheSerializer.update) — jamais utilisé à la
    # création, où il n'y a pas encore d'id.
    id = serializers.IntegerField(required=False)
    quantity_delivered = serializers.SerializerMethodField()
    quantity_remaining = serializers.SerializerMethodField()

    class Meta:
        model = MarcheLine
        fields = ["id", "designation", "unit", "reference", "quantity_ordered",
                  "quantity_delivered", "quantity_remaining"]

    def get_quantity_delivered(self, obj):
        # Seuls les bordereaux/provisoires représentent une livraison
        # physique réelle — une proforma (devis) éventuellement liée ne
        # compte pas comme livrée.
        total = obj.delivery_lines.filter(
            document__doc_type__in=["bordereau", "provisoire"]
        ).aggregate(total=Sum("quantity"))["total"]
        return total or 0

    def get_quantity_remaining(self, obj):
        return obj.quantity_ordered - self.get_quantity_delivered(obj)


class DeliveryLineSerializer(serializers.Serializer):
    """Une ligne d'un bordereau lié au marché — lecture seule, utilisée
    dans l'historique des livraisons (Marche.deliveries)."""
    marche_line = serializers.IntegerField(source="marche_line_id", allow_null=True)
    designation = serializers.CharField()
    unit = serializers.CharField()
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2)


class DeliverySerializer(serializers.Serializer):
    """Un bordereau/provisoire lié au marché, avec ses lignes — pour suivre
    l'évolution des livraisons dans le temps."""
    id = serializers.IntegerField()
    doc_type = serializers.CharField()
    number = serializers.CharField()
    issued_at = serializers.DateField()
    lines = DeliveryLineSerializer(many=True)


class MarcheSerializer(serializers.ModelSerializer):
    lines = MarcheLineSerializer(many=True)
    documents = MarcheDocumentSerializer(many=True, read_only=True)
    deliveries = serializers.SerializerMethodField()

    class Meta:
        model = Marche
        fields = ["id", "company", "client_name", "object_note", "created_at", "documents", "lines", "deliveries"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            self.fields["company"].queryset = Company.objects.filter(owner=request.user)

    def get_deliveries(self, obj):
        docs = (
            obj.deliveries.filter(doc_type__in=["bordereau", "provisoire"])
            .prefetch_related("lines")
            .order_by("-issued_at", "-id")
        )
        return DeliverySerializer(docs, many=True).data

    def create(self, validated_data):
        lines_data = validated_data.pop("lines")
        marche = Marche.objects.create(**validated_data)
        for line_data in lines_data:
            line_data.pop("id", None)
            MarcheLine.objects.create(marche=marche, **line_data)
        return marche

    def update(self, instance, validated_data):
        lines_data = validated_data.pop("lines", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if lines_data is not None:
            # Jamais de "tout supprimer puis recréer" ici : les lignes déjà
            # livrées (DocumentLine.marche_line) pointent vers des
            # MarcheLine précises — les recréer casserait ce lien (SET_NULL)
            # et ferait perdre le suivi des livraisons déjà enregistrées.
            # On réconcilie donc par id : mise à jour en place si l'id
            # existe déjà, création sinon, suppression de ce qui a disparu.
            existing_by_id = {line.id: line for line in instance.lines.all()}
            keep_ids = set()
            for line_data in lines_data:
                line_id = line_data.pop("id", None)
                if line_id and line_id in existing_by_id:
                    line_obj = existing_by_id[line_id]
                    for attr, value in line_data.items():
                        setattr(line_obj, attr, value)
                    line_obj.save()
                    keep_ids.add(line_id)
                else:
                    new_line = MarcheLine.objects.create(marche=instance, **line_data)
                    keep_ids.add(new_line.id)
            instance.lines.exclude(id__in=keep_ids).delete()
        return instance
