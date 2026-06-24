# Hush v1 service — the build-of-record (BB-31 provenance; deploy topology = build plan §11).
# The deployable is the GENERATED assembled tree (build/_assembled/{app,hush_model,sim}), not the
# per-sprint snapshots. CI assembles + tests, then this image pins the assembled artifact.
#
# One deployable, one DB, single process / few workers, synchronous — the frozen architecture
# (no microservices, no queue, no second datastore). WAL readers + a serialized writer (BB-9).
FROM python:3.13-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HUSH_DB_PATH=/data/hush.db \
    HUSH_AUTOCREATE_APP=1

WORKDIR /srv

# 1. pinned runtime deps (reproducible build-of-record)
COPY deploy/requirements.txt /srv/requirements.txt
RUN pip install --no-cache-dir -r /srv/requirements.txt

# 2. the GENERATED assembled tree (run `python build/_verify/assemble_and_test.py` first — it
#    must be green: model golden runner + API pytest). app/ imports hush_model/ + sim/.
COPY build/_assembled/app   /srv/app
COPY build/_assembled/hush_model /srv/hush_model
COPY build/_assembled/sim    /srv/sim

# 3. durable DB volume (encrypted-at-rest in prod — BB-21; backed up WAL-aware — BB-3)
VOLUME ["/data"]

# TLS terminates at the ingress (build plan §11); the app speaks plain HTTP behind it.
EXPOSE 8000

# Single write worker preserves the single-writer invariant trivially (BB-9 default topology);
# WAL gives concurrent readers. Scale readers, never writers, in v1.
# init_database runs at startup (create-or-bring-forward via the Wave-1 runner), gated in prod by
# a tested backup (BB-3 → BB-5; MIGRATION_RUNBOOK_V1.md).
CMD ["uvicorn", "app.app_main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
