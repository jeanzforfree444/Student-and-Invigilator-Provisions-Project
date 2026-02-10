#!/usr/bin/env bash

cd services/django/lithium
pip install -r requirements.txt
cd ../../frontend/app
npm install