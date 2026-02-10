SHELL := /bin/bash
DEV_COMPOSE := ops/compose/docker-compose.dev.yml
DJANGO_DIR := services/django/lithium
DJANGO_MANAGE := ./$(DJANGO_DIR)/scripts/manage.sh
FRONTEND_DIR := services/frontend/app
SMOKE_FRONTEND_CMD := npm test -- --passWithNoTests --testNamePattern="smoke|health"
SMOKE_DJANGO_CMD := . /app/.venv/bin/activate && python manage.py test timetabling_system.utils
TEST_FRONTEND_CMD := npm test -- --passWithNoTests
TEST_DJANGO_CMD := . /app/.venv/bin/activate && python manage.py makemigrations --noinput && python manage.py migrate --noinput && python manage.py test
COVERAGE_FRONTEND_CMD := npm test -- --coverage --passWithNoTests


.PHONY: up down logs build reset-django-db migrations makemigrations migrate superuser django frontend test coverage-summary
up:
	@echo "Installing frontend dependencies locally so the container can run tests without hitting the network..."
	rm -rf $(FRONTEND_DIR)/node_modules
	cd $(FRONTEND_DIR) && npm ci --no-progress --prefer-offline
	docker compose -f $(DEV_COMPOSE) up -d --build || echo "No services defined yet"
	@echo "Running frontend tests inside the container..."
	docker compose -f $(DEV_COMPOSE) exec frontend sh -lc 'set -eu; cd /app; $(SMOKE_FRONTEND_CMD)'
	@echo "Waiting for the Django virtualenv to be ready..."
	docker compose -f $(DEV_COMPOSE) exec django bash -lc 'while [ ! -x /app/.venv/bin/python ]; do sleep 2; done'
	@echo "Running Django test suite..."
	docker compose -f $(DEV_COMPOSE) exec django bash -lc '$(SMOKE_DJANGO_CMD)'
down: ; docker compose -f $(DEV_COMPOSE) down -v || true
logs: ; docker compose -f $(DEV_COMPOSE) logs -f --tail=200 || echo "No services running"
build:; docker compose -f $(DEV_COMPOSE) build --pull || echo "Nothing to build"
reset-django-db:
	@echo "Stopping Django service..."
	- docker compose -f $(DEV_COMPOSE) stop django >/dev/null 2>&1 || true
	@echo "Removing embedded PostgreSQL data directory..."
	rm -rf services/django/lithium/.postgres-data
	@echo "Restarting Django service with a fresh database..."
	docker compose -f $(DEV_COMPOSE) up -d django || echo "Failed to restart django service"

create-admin:
	@echo "Ensuring Django service is running..."
	docker compose -f $(DEV_COMPOSE) up -d --no-build django || true
	@echo "Waiting for the Django virtualenv to be ready..."
	docker compose -f $(DEV_COMPOSE) exec django bash -lc 'while [ ! -x /app/.venv/bin/python ]; do sleep 2; done'
	@echo "Creating/updating admin user \"$(USER)\" with token..."
	docker compose -f $(DEV_COMPOSE) exec django bash -lc '\
		. /app/.venv/bin/activate && \
		python manage.py shell -c "\
from django.contrib.auth import get_user_model; \
from rest_framework.authtoken.models import Token; \
User = get_user_model(); \
u, created = User.objects.get_or_create(username=\"$(USER)\", defaults={\"email\": \"$(EMAIL)\", \"is_staff\": True, \"is_superuser\": True, \"is_senior_admin\": True}); \
u.email = \"$(EMAIL)\"; u.set_password(\"$(PASSWORD)\"); u.is_staff = True; u.is_superuser = True; u.is_senior_admin = True; u.is_active = True; u.save(); \
Token.objects.filter(user=u).delete(); t = Token.objects.create(user=u); \
print(f\"Admin {u.username} ready. Token: {t.key}\")" \
	'

makemigrations:
	$(DJANGO_MANAGE) makemigrations timetabling_system

migrations: makemigrations

migrate: makemigrations
	$(DJANGO_MANAGE) migrate

superuser:
	@echo "Ensuring Django service is running..."
	docker compose -f $(DEV_COMPOSE) up -d --no-build django || true
	@echo "Waiting for the Django virtualenv to be ready..."
	docker compose -f $(DEV_COMPOSE) exec django bash -lc 'while [ ! -x /app/.venv/bin/python ]; do sleep 2; done'
	@echo "Launching Django createsuperuser..."
	docker compose -f $(DEV_COMPOSE) exec django bash -lc '. /app/.venv/bin/activate && python manage.py createsuperuser'

django:
	docker compose -f $(DEV_COMPOSE) up --build --no-deps django

frontend:
	@if [ ! -d $(FRONTEND_DIR)/node_modules ]; then \
		cd $(FRONTEND_DIR) && npm ci --no-progress --prefer-offline; \
	fi
	docker compose -f $(DEV_COMPOSE) up --build --no-deps frontend

test:
	@echo "Running full frontend unit tests (no rebuild)..."
	docker compose -f $(DEV_COMPOSE) up -d --no-build frontend || true
	docker compose -f $(DEV_COMPOSE) exec frontend sh -lc 'set -eu; cd /app; $(TEST_FRONTEND_CMD)'
	@echo "Running full Django test suite (no rebuild)..."
	docker compose -f $(DEV_COMPOSE) up -d --no-build django || true
	docker compose -f $(DEV_COMPOSE) exec django bash -lc '$(TEST_DJANGO_CMD)'

coverage:
	@echo "Calculating frontend test coverage..."
	docker compose -f $(DEV_COMPOSE) up -d --no-build frontend || true
	docker compose -f $(DEV_COMPOSE) exec frontend sh -lc 'set -eu; cd /app; $(COVERAGE_FRONTEND_CMD)'
	@echo "Calculating Django test coverage (per-file missing lines)..."
	docker compose -f $(DEV_COMPOSE) up -d --no-build django || true
	docker compose -f $(DEV_COMPOSE) exec django bash -lc '\
		set -euo pipefail; \
		cd /app; \
		. /app/.venv/bin/activate; \
		if ! python -c "import coverage" >/dev/null 2>&1; then \
			python -m pip install --quiet "coverage>=7.5"; \
		fi; \
		python manage.py makemigrations --noinput; \
		python manage.py migrate --noinput; \
		coverage erase; \
		coverage run --rcfile=/app/.coveragerc manage.py test --keepdb; \
		coverage report -m; \
	'

coverage-summary: coverage
	@echo "Generating combined frontend + Django coverage summary..."
	docker compose -f $(DEV_COMPOSE) exec django bash -lc '\
		set -euo pipefail; \
		cd /app; \
		. /app/.venv/bin/activate; \
		coverage json -o /tmp/coverage.json; \
	'
	docker compose -f $(DEV_COMPOSE) exec django bash -lc 'cat /tmp/coverage.json' > .django-coverage.json
	node - <<'NODE'\nconst fs = require('fs');\nconst clover = fs.readFileSync('services/frontend/app/coverage/clover.xml','utf8');\nconst m = clover.match(/<metrics[^>]*\\bstatements=\"(\\d+)\"[^>]*\\bcoveredstatements=\"(\\d+)\"[^>]*\\bloc=\"(\\d+)\"[^>]*\\bncloc=\"(\\d+)\"/);\nif (!m) { console.error('Failed to read frontend clover metrics'); process.exit(1); }\nconst frontendStatements = Number(m[1]);\nconst frontendCoveredStatements = Number(m[2]);\nconst frontendLoc = Number(m[3]);\nconst django = JSON.parse(fs.readFileSync('.django-coverage.json','utf8'));\nconst djangoStatements = django.totals?.num_statements ?? 0;\nconst djangoCoveredStatements = django.totals?.covered_lines ?? 0;\nconst combinedStatementsTotal = frontendStatements + djangoStatements;\nconst combinedStatementsCovered = frontendCoveredStatements + djangoCoveredStatements;\nconst combinedStatementPct = combinedStatementsTotal ? (combinedStatementsCovered / combinedStatementsTotal * 100) : 0;\nconst combinedLineTotal = frontendLoc + djangoStatements;\nconst combinedLineCovered = frontendCoveredStatements + djangoCoveredStatements;\nconst combinedLinePct = combinedLineTotal ? (combinedLineCovered / combinedLineTotal * 100) : 0;\nconsole.log(`Frontend statements: ${frontendCoveredStatements}/${frontendStatements} (${(frontendCoveredStatements/frontendStatements*100).toFixed(2)}%)`);\nconsole.log(`Django statements: ${djangoCoveredStatements}/${djangoStatements} (${(djangoCoveredStatements/djangoStatements*100).toFixed(2)}%)`);\nconsole.log(`Combined statements: ${combinedStatementsCovered}/${combinedStatementsTotal} (${combinedStatementPct.toFixed(2)}%)`);\nconsole.log(`Combined lines: ${combinedLineCovered}/${combinedLineTotal} (${combinedLinePct.toFixed(2)}%)`);\nNODE
