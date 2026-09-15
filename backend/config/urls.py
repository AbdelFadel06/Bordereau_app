from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/companies/", include("companies.urls")),
    path("api/documents/", include("documents.urls")),
    path("api/catalog/", include("catalog.urls")),
    path("api/ingestion/", include("ingestion.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
