#!/usr/bin/env bash

cd services/django/lithium
python manage.py runserver  --verbosity 0 > /dev/null 2>&1 &

cd ../../frontend/app
npm run start