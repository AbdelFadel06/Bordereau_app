from rest_framework import serializers
from companies.models import Company
from .models import Article


class ArticleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Article
        fields = ["id", "company", "designation", "default_unit", "default_reference", "default_price"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            self.fields["company"].queryset = Company.objects.filter(owner=request.user)
