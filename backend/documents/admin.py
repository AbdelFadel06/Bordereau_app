from django.contrib import admin
from .models import Document, DocumentLine

class DocumentLineInline(admin.TabularInline):
    model = DocumentLine

@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ["number", "doc_type", "client", "status", "issued_at"]
    inlines = [DocumentLineInline]
