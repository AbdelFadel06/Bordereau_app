from rest_framework.routers import DefaultRouter
from .views import MarcheViewSet

router = DefaultRouter()
router.register("", MarcheViewSet, basename="marche")

urlpatterns = router.urls
