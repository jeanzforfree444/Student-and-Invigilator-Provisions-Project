#!/usr/bin/env bash

cd services/django/lithium
python manage.py migrate --noinput
gunicorn --bind 0.0.0.0:${PORT:-8000} --workers 2 django_project.wsgi
