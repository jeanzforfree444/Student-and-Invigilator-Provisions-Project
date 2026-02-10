#!/usr/bin/env bash

cd services/django/lithium
pip install -r requirements.txt
python manage.py runserver  --verbosity 0 > /dev/null 2>&1 &
cd ../../frontend/app
npm install
npm run start