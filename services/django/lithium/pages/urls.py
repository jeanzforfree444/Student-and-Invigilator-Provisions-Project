from django.urls import path

from .views import AboutPageView, HomePageView, healthz_view

urlpatterns = [
    path("", HomePageView.as_view(), name="home"),
    path("about/", AboutPageView.as_view(), name="about"),
    path("healthz/", healthz_view, name="healthz"),
]
