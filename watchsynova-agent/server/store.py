"""Persistence backend for the platform config.

If ``WATCHSYNOVA_DB_URL`` is set the whole config dict lives as a single JSONB
row in Postgres. The URL is the only thing that changes to point at a managed
database later (e.g. Amazon RDS) -- no code change. When the env var is absent
we fall back to the JSON file, so behaviour is identical without a database.

Semantics for v1 match the previous single-file store: the whole config is read
and written atomically as one document (last writer wins). Per-entity row
locking / normalization is a later step; this migration only moves the same
document onto Postgres for durability, backups and RDS portability.
"""

import json
import os

DB_URL = os.environ.get("WATCHSYNOVA_DB_URL", "").strip()


def db_enabled() -> bool:
    return bool(DB_URL)


def _connect():
    import psycopg2  # lazy import: only required in DB mode

    return psycopg2.connect(DB_URL, connect_timeout=10)


def _ensure_schema(cur) -> None:
    cur.execute(
        "CREATE TABLE IF NOT EXISTS platform_config ("
        " id integer PRIMARY KEY DEFAULT 1,"
        " data jsonb NOT NULL,"
        " updated_at timestamptz NOT NULL DEFAULT now(),"
        " CONSTRAINT platform_config_singleton CHECK (id = 1))"
    )


def db_load() -> dict | None:
    """Return the stored config dict, or None when the table has no row yet."""
    conn = _connect()
    try:
        with conn:
            with conn.cursor() as cur:
                _ensure_schema(cur)
                cur.execute("SELECT data FROM platform_config WHERE id = 1")
                row = cur.fetchone()
                return row[0] if row else None
    finally:
        conn.close()


def db_save(config: dict) -> None:
    conn = _connect()
    try:
        with conn:
            with conn.cursor() as cur:
                _ensure_schema(cur)
                cur.execute(
                    "INSERT INTO platform_config (id, data, updated_at)"
                    " VALUES (1, %s::jsonb, now())"
                    " ON CONFLICT (id) DO UPDATE SET"
                    " data = EXCLUDED.data, updated_at = now()",
                    [json.dumps(config, ensure_ascii=False)],
                )
    finally:
        conn.close()
