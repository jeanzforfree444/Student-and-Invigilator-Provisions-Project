# JH03 Platform

An internal webapp for uploading and managing university exam timetables, venues, invigilators, and student provisions. The tool is designed to take in large excel files, automate provisioning of students and store the data in a database. Pages have been designed to allow for easy manipulation of the data, to perform functions that would previously have been the transfrerring of excel cells. The stack ships as two Dockerised services:

- **Frontend** &mdash; React + Vite UI served from `services/frontend`.
- **API** &mdash; Django 5 project in `services/django/lithium`, which boots an embedded PostgreSQL instance and exposes application, authentication, bulk delete, and health endpoints.

CI builds each service image with Kaniko and runs the frontend Vitest suite plus the Django test suite on GitLab.

---

## How uploads work (admin-only)

1) **Venue uploads** (extra rooms sheet, venue-style Excel)  
   - Creates/updates `Venue` rows.  
   - Captures capacity, venue type, accessibility, qualifications, per-day availability (ISO dates), and provision capabilities you can set on the venue. These venues start as “spares” for allocation.

2) **Exam uploads** (exam timetable sheet)  
   - Creates/updates `Exam` rows.  
   - Creates `ExamVenue` links for any venue names in the sheet (no availability captured here).

3) **Manual step (before provisions ingest)**  
   - Tag each `Venue` with provision capabilities (e.g., separate room, accessible hall, computer). `ExamVenue` rows inherit the capabilities of the `Venue` they point to; matching happens when provisions are ingested.

4) **Provisions uploads** (student provision sheet)  
   - Upserts `Student`, `StudentExam`, and `Provisions` rows (normalises phrases like “reader/scribe/extra time”).  
   - For each student + exam, it finds an existing `ExamVenue` whose venue already has the required capabilities; if none match, it picks a compatible available venue (by capability/availability) and creates a new `ExamVenue`, attaching it to the student.

---

## Tech Stack

- React 19 + Vite + Material UI (frontend)
- Django 5 + django-allauth + PostgreSQL 15 (backend)
- Docker / Docker Compose v2 for local orchestration
- Vitest and Django’s test runner for automated tests

---

## Repository Layout

| Path | Description |
| --- | --- |
| `services/frontend/app` | React client, Vite config, Vitest tests under `tests/`. |
| `services/django/lithium` | Django project, embedded Postgres data dir `.postgres-data/`, management scripts. |
| `ops/compose/docker-compose.dev.yml` | Compose file used by all Make targets / scripts. |
| `prepare-environment` / `refresh-environment` | Helper scripts that configure UID/GID mappings and run the dev refresh routine. |
| `ops/scripts/dev-refresh.sh` | Stops/rebuilds the stack, installs deps, and runs service tests. |
| `Makefile` | Convenience targets (`up`, `down`, `logs`, `build`, `migrate`, `reset-django-db`). |

---

## Prerequisites

1. Docker Engine / Docker Desktop with Compose v2.
2. Bash-compatible shell (scripts rely on `bash`).
3. No other service listening on ports 3000 or 8000.

---

## First-Time Setup

```bash
./prepare-environment
```

This script:

1. Writes your UID/GID to `ops/compose/.env` so containers run as you.
2. Creates shared `node_modules`/cache folders under `.docker/`.
3. Calls `refresh-environment`, which rebuilds the stack, installs dependencies, runs migrations, and executes both test suites inside their containers.

---

## Everyday Development Workflow

1. **Start the stack**

   ```bash
   make up
   ```

   Builds (if needed) and starts the frontend (port `3000`) and Django API (port `8000`). The Django container automatically:

   - Spins up its own PostgreSQL cluster under `services/django/lithium/.postgres-data`.
   - Installs/updates the Python virtualenv.
   - Runs `python manage.py makemigrations` and `python manage.py migrate` before launching the dev server.

2. **Watch logs**

   ```bash
   make logs        # tails both services
   docker compose -f ops/compose/docker-compose.dev.yml logs -f django
   ```

3. **Stop / tear down**

   ```bash
   make down        # stops containers and removes volumes
   ```

4. **Full rebuild + test cycle**

   ```bash
   ./refresh-environment
   ```

   Wraps `ops/scripts/dev-refresh.sh`: stops everything, rebuilds images, installs dependencies, runs migrations, and executes the frontend + Django test suites.

---

## Make Targets

| Command | Description |
| --- | --- |
| `make up` | Build and start the dev stack (`ops/compose/docker-compose.dev.yml`). |
| `make django` | Start only the Django service in the foreground (logs stay attached). |
| `make frontend` | Start only the frontend service in the foreground (no dependencies). |
| `make test` | Run full unit tests for frontend and Django inside running containers (no rebuild). |
| `make coverage` | Run Django tests with coverage inside the container and print per-file missing lines (`coverage report -m`). |
| `make down` | Stop containers and remove dev volumes. |
| `make logs` | Tail combined service logs. |
| `make build` | Rebuild service images with `--pull`. |
| `make migrate` | Ensures the Django container is running, then runs `makemigrations` and `migrate` inside it. |
| `make reset-django-db` | Stops the Django container, deletes `.postgres-data`, and restarts it with a fresh embedded PostgreSQL cluster (all data wiped). |

---

## Testing

| Service | Command |
| --- | --- |
| Frontend | `docker compose -f ops/compose/docker-compose.dev.yml exec frontend npm test` |
| Frontend (watch) | `docker compose -f ops/compose/docker-compose.dev.yml exec frontend npm run test:watch` |
| Django (all apps) | `docker compose -f ops/compose/docker-compose.dev.yml exec django bash -lc '. /app/.venv/bin/activate && python manage.py test'` |
| Django (pages app only) | `docker compose -f ops/compose/docker-compose.dev.yml exec django bash -lc '. /app/.venv/bin/activate && python manage.py test pages'` |

CI mirrors these commands via `.gitlab-ci.yml`.

---

## Authentication & roles

- **Default admin** — seeded automatically by migration:  
  - username: `test1`  
  - email: `test1@example.com`  
  - password: `test2test2`  
  This account is staff + superuser and has an API token created for it.
- **Senior admins** — subset of admins with elevated privileges:
  - Can promote invigilators to admins.
  - Can remove admin privileges (revert to invigilator).
  - Can promote admins to senior admins.
- **Login endpoint** — `POST /api/auth/token/login/` with `{ "username": "<email or username>", "password": "<password>" }` returns `{ token, user, role }`.  
  - `role` is `admin` for staff/superuser, otherwise `invigilator`.
- **Who can access what**  
  - Admin routes and API endpoints (`/admin/*` React pages, `/api/*` except auth) require an authenticated admin (is_staff/superuser).  
  - Invigilator routes (`/invigilator/*`) require an authenticated invigilator token.  
  - Anonymous users are always redirected to `/login`.
- **Frontend storage** — tokens/user info prefer `sessionStorage` (with a one-time migration from `localStorage`) via `authToken`/`authUser`. Logout clears both.
- **Creating more users** — run `createsuperuser` (for admins) or create a regular user + `Invigilator` profile via Django admin to grant invigilator access.
- **CSRF / cookies** — secure/HTTP-only cookies can be toggled for prod via env:
  - `DJANGO_SECURE_COOKIES=1` makes session/CSRF cookies secure-only.
  - `DJANGO_CSRF_HTTPONLY=1` (default) hides the CSRF cookie from JavaScript.
  - `DJANGO_SECURE_SSL_REDIRECT=1` forces HTTPS.
  - `DJANGO_SESSION_COOKIE_SAMESITE` / `DJANGO_CSRF_COOKIE_SAMESITE` default to `Lax`; override as needed.
- **Hardening toggles**  
  - `DJANGO_CORS_ALLOWED_ORIGINS` and `DJANGO_CSRF_TRUSTED_ORIGINS`: comma-separated lists to restrict origins (defaults cover localhost only).
  - DRF throttling: override `DRF_THROTTLE_ANON_RATE` / `DRF_THROTTLE_USER_RATE` / `DRF_THROTTLE_LOGIN_RATE` (defaults 50/min anon, 200/min user, 10/min login). Admin-only API viewsets skip throttling to allow bulk operations.
  - Passwords: minimum length 12 and must include upper, lower, digit, and symbol.
  - Secrets: set `DJANGO_SECRET_KEY` and `DJANGO_DB_PASSWORD` in non-dev environments; the app will refuse to start in production with the dev defaults.

---

## Working With the Database

- Data lives in `services/django/lithium/.postgres-data/` (git-ignored). Delete it or run `make reset-django-db` to wipe everything.
- Because migrations run on every container start, schema changes are immediately applied. When you intentionally change models, run `make migrate` to generate migration files in `services/django/lithium/<app>/migrations/` and commit them.
- `psql` is available inside the Django container: `docker compose -f ops/compose/docker-compose.dev.yml exec django bash -lc 'psql $DJANGO_DB_NAME'`.
- The Django service reads the same environment variables locally and in CI: `DJANGO_DB_HOST` (default `127.0.0.1`), `DJANGO_DB_PORT` (`5432`), `DJANGO_DB_NAME` (`postgres`), `DJANGO_DB_USER` (`postgres`), `DJANGO_DB_PASSWORD` (`postgres`). Override as needed; both Docker Compose and GitLab pass these through unchanged. In production `DJANGO_DB_PASSWORD` must be non-default.

---

## Health & Endpoints

- `/healthz` (served from Django) returns `{status: "ok"}` when `SELECT 1` succeeds against PostgreSQL and `503` otherwise.
- Bulk admin endpoints (all admin-only, throttling bypassed):
  - `POST /api/exams/bulk-delete/` with `{"ids": [1,2,...]}`.
  - `POST /api/venues/bulk-delete/` with `{"ids": ["Hall A","Hall B"]}`.
  - `POST /api/invigilators/bulk-delete/` with `{"ids": [1,2,...]}`.
- Frontend API calls read `VITE_API_URL` (set to `http://localhost:8000` in Compose) and fall back to the current browser origin; the helper appends `/api` if missing.

---

## Troubleshooting

- **Vitest cannot find dependencies** &mdash; ensure `.docker/node_modules/frontend` is owned by you. Re-run `./prepare-environment` if Docker created them as root.
- **Django can’t start Postgres** &mdash; another local Postgres might already bind to port `5432` inside the container. Stop conflicting services or change `DJANGO_DB_PORT` in `ops/compose/docker-compose.dev.yml`.
- **Stale containers** &mdash; run `make down` followed by `docker compose -f ops/compose/docker-compose.dev.yml rm -fsv` to remove orphaned containers.
- **CI failures** &mdash; confirm `package-lock.json` and Django migrations are committed; the pipelines expect deterministic installs/migrations.

---

## Contributing

1. Create a feature branch.
2. Run `./refresh-environment` (or at minimum `make up` + both test suites) before pushing.
3. Commit code, migration files, and relevant docs together.
4. Open a merge request; CI must be green before merging.

### Developer Documentation (Handover)

- Developer docs live in `handover/developer_docs`.
- If you change the codebase, update the LaTeX sources in `handover/developer_docs/chapters` and rebuild the PDF.
- Generate the PDF with:

```
./generate-docs-pdf.sh
```

For questions, drop a note in your team channel. Happy hacking!

---

## Acknowledgements & Licensing

- The Django service is adapted from [Lithium](https://github.com/wsvincent/lithium) (formerly DjangoX) by William S. Vincent, released under the MIT License. The upstream copyright and license notice is preserved in `services/django/lithium/LICENSE`.
- Additional third-party libraries retain their respective licenses; consult `package.json`, `pyproject.toml`, or the `LICENSE` files within each service for details.
