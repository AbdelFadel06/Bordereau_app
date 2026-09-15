from django.urls import path
from .views import LetterheadUploadView

urlpatterns = [
    path("companies/<int:company_id>/letterhead/", LetterheadUploadView.as_view(), name="letterhead-upload"),
]
