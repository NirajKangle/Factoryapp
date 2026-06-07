import json
import logging
import os
import secrets
import sqlite3
import string
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, send_from_directory, url_for

from bootstrap import ensure_n8n_running, load_dotenv_file
from station_auth import DEVICE_TOKEN_COOKIE, extract_device_token, generate_device_token
from webhooks import dispatch_status_change_async

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
load_dotenv_file()
DEFAULT_SQLITE_PATH = BASE_DIR / "werqr.db"
LEGACY_SQLITE_PATH = BASE_DIR / "midc_shop.db"


def resolve_sqlite_path() -> Path:
    if DEFAULT_SQLITE_PATH.exists():
        return DEFAULT_SQLITE_PATH
    if LEGACY_SQLITE_PATH.exists():
        return LEGACY_SQLITE_PATH
    return DEFAULT_SQLITE_PATH
REACT_DIST = BASE_DIR / "static" / "dist"

STATUSES = [
    ("pre_work", "Pre-Work"),
    ("machining", "Machining"),
    ("qc", "QC"),
    ("dispatch", "Dispatch"),
]

STATUS_ORDER = [status for status, _ in STATUSES]
STATUS_LABELS = dict(STATUSES)
VALID_STATUSES = ", ".join(f"'{status}'" for status in STATUS_ORDER)
TASK_ID_ALPHABET = string.ascii_letters + string.digits
TASK_ID_LENGTH = 8

DB_BACKEND = "sqlite"
DB_TARGET = str(DEFAULT_SQLITE_PATH)

DEFAULT_AUTHOR_NAME = (
    os.environ.get("DEFAULT_AUTHOR_NAME", "Shop Floor").strip() or "Shop Floor"
)
DEFAULT_ASSIGNEE_NAME = (
    os.environ.get("DEFAULT_ASSIGNEE_NAME", "Alex Chen").strip() or "Alex Chen"
)
DEFAULT_ASSIGNEE_PHOTO = os.environ.get(
    "DEFAULT_ASSIGNEE_PHOTO",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80",
).strip()


def resolve_db_config():
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if database_url.startswith(("postgresql://", "postgres://")):
        return "postgres", database_url
    if database_url.startswith("sqlite:///"):
        return "sqlite", database_url.removeprefix("sqlite:///")
    return "sqlite", str(resolve_sqlite_path())


def as_datetime(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if value is None:
        return None
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def configure_database():
    global DB_BACKEND, DB_TARGET

    requested_backend, requested_target = resolve_db_config()
    if requested_backend == "postgres":
        try:
            import psycopg2

            conn = psycopg2.connect(requested_target)
            conn.close()
            DB_BACKEND = "postgres"
            DB_TARGET = requested_target
            print(f"Using PostgreSQL: {requested_target}")
            return
        except Exception as exc:
            print(
                "PostgreSQL unavailable "
                f"({exc}). Falling back to SQLite at {DEFAULT_SQLITE_PATH}"
            )

    DB_BACKEND = "sqlite"
    DB_TARGET = requested_target if requested_backend == "sqlite" else str(DEFAULT_SQLITE_PATH)
    print(f"Using SQLite: {DB_TARGET}")


@contextmanager
def get_db():
    if DB_BACKEND == "postgres":
        import psycopg2

        conn = psycopg2.connect(DB_TARGET)
    else:
        conn = sqlite3.connect(DB_TARGET)
        conn.row_factory = sqlite3.Row

    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def generate_task_id(conn):
    while True:
        task_id = "".join(secrets.choice(TASK_ID_ALPHABET) for _ in range(TASK_ID_LENGTH))
        if DB_BACKEND == "postgres":
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM jobs WHERE task_id = %s", (task_id,))
                exists = cur.fetchone()
        else:
            exists = conn.execute(
                "SELECT 1 FROM jobs WHERE task_id = ?",
                (task_id,),
            ).fetchone()
        if not exists:
            return task_id


def sqlite_table_exists(conn, table_name):
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def sqlite_columns(conn, table_name):
    return [row[1] for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()]


def migrate_sqlite_schema(conn):
    if not sqlite_table_exists(conn, "jobs"):
        return

    columns = sqlite_columns(conn, "jobs")
    if "task_id" in columns and sqlite_table_exists(conn, "status_update_history"):
        if sqlite_table_exists(conn, "status_history"):
            conn.execute("DROP TABLE IF EXISTS status_history")
        migrate_job_people_columns(conn)
        migrate_mes_schema(conn)
        return

    legacy_jobs = [
        dict(row)
        for row in conn.execute(
            "SELECT job_id, client_phone, status, created_at, updated_at FROM jobs"
        ).fetchall()
    ]
    legacy_history = []
    if sqlite_table_exists(conn, "status_history"):
        legacy_history = [
            dict(row)
            for row in conn.execute(
                """
                SELECT job_id, from_status, to_status, changed_at
                FROM status_history
                ORDER BY id
                """
            ).fetchall()
        ]

    job_id_to_task_id = {}
    used_task_ids = set()
    for job in legacy_jobs:
        while True:
            task_id = "".join(
                secrets.choice(TASK_ID_ALPHABET) for _ in range(TASK_ID_LENGTH)
            )
            if task_id not in used_task_ids:
                used_task_ids.add(task_id)
                job_id_to_task_id[job["job_id"]] = task_id
                job["task_id"] = task_id
                job["description"] = ""
                break

    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute("DROP TABLE IF EXISTS status_history")
    conn.execute("DROP TABLE IF EXISTS status_update_history")
    conn.execute("DROP TABLE IF EXISTS jobs")

    conn.executescript(
        f"""
        CREATE TABLE jobs (
          task_id       TEXT PRIMARY KEY,
          job_id        TEXT NOT NULL,
          client_phone  TEXT NOT NULL,
          description   TEXT NOT NULL DEFAULT '',
          status        TEXT NOT NULL DEFAULT 'pre_work'
                        CHECK (status IN ({VALID_STATUSES})),
          created_at    TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE status_update_history (
          task_id       TEXT NOT NULL REFERENCES jobs (task_id) ON DELETE CASCADE,
          from_status   TEXT CHECK (
                          from_status IS NULL OR from_status IN ({VALID_STATUSES})
                        ),
          to_status     TEXT NOT NULL CHECK (to_status IN ({VALID_STATUSES})),
          changed_at    TEXT NOT NULL DEFAULT (datetime('now')),
          recorded_at   TEXT,
          operational_start_time TEXT,
          device_name   TEXT,
          operator_id   TEXT
        );

        CREATE INDEX idx_jobs_status ON jobs (status);
        CREATE INDEX idx_jobs_client_phone ON jobs (client_phone);
        CREATE INDEX idx_status_update_history_task_id_changed_at
          ON status_update_history (task_id, changed_at DESC);
        """
    )

    for job in legacy_jobs:
        conn.execute(
            """
            INSERT INTO jobs (
              task_id, job_id, client_phone, description, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job["task_id"],
                job["job_id"],
                job["client_phone"],
                job.get("description", ""),
                job["status"],
                job["created_at"],
                job["updated_at"],
            ),
        )

    for entry in legacy_history:
        task_id = job_id_to_task_id.get(entry["job_id"])
        if not task_id:
            continue
        conn.execute(
            """
            INSERT INTO status_update_history (task_id, from_status, to_status, changed_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                task_id,
                entry["from_status"],
                entry["to_status"],
                entry["changed_at"],
            ),
        )

    conn.execute("PRAGMA foreign_keys = ON")


def migrate_job_people_columns(conn):
    if not sqlite_table_exists(conn, "jobs"):
        return

    columns = sqlite_columns(conn, "jobs")
    if "author" not in columns:
        conn.execute(
            f"""
            ALTER TABLE jobs ADD COLUMN author TEXT NOT NULL
            DEFAULT '{DEFAULT_AUTHOR_NAME.replace("'", "''")}'
            """
        )
    if "assignee_name" not in columns:
        conn.execute(
            f"""
            ALTER TABLE jobs ADD COLUMN assignee_name TEXT NOT NULL
            DEFAULT '{DEFAULT_ASSIGNEE_NAME.replace("'", "''")}'
            """
        )
    if "assignee_photo" not in columns:
        conn.execute(
            f"""
            ALTER TABLE jobs ADD COLUMN assignee_photo TEXT NOT NULL
            DEFAULT '{DEFAULT_ASSIGNEE_PHOTO.replace("'", "''")}'
            """
        )

    conn.execute(
        """
        UPDATE jobs
        SET author = ?
        WHERE author IS NULL OR author = ''
        """,
        (DEFAULT_AUTHOR_NAME,),
    )
    conn.execute(
        """
        UPDATE jobs
        SET assignee_name = ?
        WHERE assignee_name IS NULL OR assignee_name = ''
        """,
        (DEFAULT_ASSIGNEE_NAME,),
    )
    conn.execute(
        """
        UPDATE jobs
        SET assignee_photo = ?
        WHERE assignee_photo IS NULL OR assignee_photo = ''
        """,
        (DEFAULT_ASSIGNEE_PHOTO,),
    )


TRACKING_MODES = ("unit", "progress", "checklist")


def migrate_devices_table(conn):
    if DB_BACKEND == "postgres":
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'workstations'
                """
            )
            if cur.fetchone():
                cur.execute(
                    """
                    SELECT 1 FROM information_schema.tables
                    WHERE table_name = 'devices'
                    """
                )
                if cur.fetchone() is None:
                    cur.execute("ALTER TABLE workstations RENAME TO devices")

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS devices (
                  device_name   TEXT PRIMARY KEY,
                  device_token  TEXT NOT NULL UNIQUE,
                  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            cur.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'devices'
                """
            )
            device_cols = {row[0] for row in cur.fetchall()}
            if "station_status" in device_cols:
                cur.execute("ALTER TABLE devices DROP COLUMN station_status")
            if "workstation_id" in device_cols and "device_name" not in device_cols:
                cur.execute(
                    "ALTER TABLE devices RENAME COLUMN workstation_id TO device_name"
                )
        return

    if sqlite_table_exists(conn, "workstations") and not sqlite_table_exists(conn, "devices"):
        conn.execute("ALTER TABLE workstations RENAME TO devices")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS devices (
          device_name   TEXT PRIMARY KEY,
          device_token  TEXT NOT NULL UNIQUE,
          created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    device_columns = sqlite_columns(conn, "devices")
    if "station_status" in device_columns:
        conn.execute("ALTER TABLE devices DROP COLUMN station_status")
    if "workstation_id" in device_columns and "device_name" not in device_columns:
        conn.execute("ALTER TABLE devices RENAME COLUMN workstation_id TO device_name")


def migrate_status_history_schema(conn):
    if DB_BACKEND == "postgres":
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'status_update_history'
                """
            )
            cols = {row[0] for row in cur.fetchall()}
            if not cols:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS status_update_history (
                      task_id       TEXT NOT NULL REFERENCES jobs (task_id) ON DELETE CASCADE,
                      from_status   job_status,
                      to_status     job_status NOT NULL,
                      changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
                      recorded_at   TIMESTAMPTZ,
                      operational_start_time TIMESTAMPTZ,
                      device_name   TEXT,
                      operator_id   TEXT
                    )
                    """
                )
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_status_update_history_task_id_changed_at
                    ON status_update_history (task_id, changed_at DESC)
                    """
                )
                return
            if "id" not in cols and "device_name" in cols:
                return

            cur.execute(
                "ALTER TABLE status_update_history RENAME TO _status_update_history_legacy"
            )
            cur.execute(
                """
                CREATE TABLE status_update_history (
                  task_id       TEXT NOT NULL REFERENCES jobs (task_id) ON DELETE CASCADE,
                  from_status   job_status,
                  to_status     job_status NOT NULL,
                  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
                  recorded_at   TIMESTAMPTZ,
                  operational_start_time TIMESTAMPTZ,
                  device_name   TEXT,
                  operator_id   TEXT
                )
                """
            )
            legacy_device = (
                "workstation_id"
                if "workstation_id" in cols
                else ("device_name" if "device_name" in cols else "NULL")
            )
            recorded = "recorded_at" if "recorded_at" in cols else "changed_at"
            operational = (
                "operational_start_time"
                if "operational_start_time" in cols
                else "NULL"
            )
            operator = "operator_id" if "operator_id" in cols else "NULL"
            cur.execute(
                f"""
                INSERT INTO status_update_history (
                  task_id, from_status, to_status, changed_at,
                  recorded_at, operational_start_time, device_name, operator_id
                )
                SELECT task_id, from_status, to_status, changed_at,
                       {recorded}, {operational}, {legacy_device}, {operator}
                FROM _status_update_history_legacy
                """
            )
            cur.execute("DROP TABLE _status_update_history_legacy")
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_status_update_history_task_id_changed_at
                ON status_update_history (task_id, changed_at DESC)
                """
            )
        return

    if not sqlite_table_exists(conn, "status_update_history"):
        conn.executescript(
            f"""
            CREATE TABLE IF NOT EXISTS status_update_history (
              task_id       TEXT NOT NULL REFERENCES jobs (task_id) ON DELETE CASCADE,
              from_status   TEXT CHECK (
                              from_status IS NULL OR from_status IN ({VALID_STATUSES})
                            ),
              to_status     TEXT NOT NULL CHECK (to_status IN ({VALID_STATUSES})),
              changed_at    TEXT NOT NULL DEFAULT (datetime('now')),
              recorded_at   TEXT,
              operational_start_time TEXT,
              device_name   TEXT,
              operator_id   TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_status_update_history_task_id_changed_at
              ON status_update_history (task_id, changed_at DESC);
            """
        )
        return

    cols = sqlite_columns(conn, "status_update_history")
    if "id" not in cols and "device_name" in cols:
        return

    legacy_device = (
        "workstation_id"
        if "workstation_id" in cols
        else ("device_name" if "device_name" in cols else "NULL")
    )
    recorded = "recorded_at" if "recorded_at" in cols else "changed_at"
    operational = (
        "operational_start_time" if "operational_start_time" in cols else "NULL"
    )
    operator = "operator_id" if "operator_id" in cols else "NULL"

    conn.execute("ALTER TABLE status_update_history RENAME TO _status_update_history_legacy")
    conn.executescript(
        f"""
        CREATE TABLE status_update_history (
          task_id       TEXT NOT NULL REFERENCES jobs (task_id) ON DELETE CASCADE,
          from_status   TEXT CHECK (
                          from_status IS NULL OR from_status IN ({VALID_STATUSES})
                        ),
          to_status     TEXT NOT NULL CHECK (to_status IN ({VALID_STATUSES})),
          changed_at    TEXT NOT NULL DEFAULT (datetime('now')),
          recorded_at   TEXT,
          operational_start_time TEXT,
          device_name   TEXT,
          operator_id   TEXT
        );
        INSERT INTO status_update_history (
          task_id, from_status, to_status, changed_at,
          recorded_at, operational_start_time, device_name, operator_id
        )
        SELECT task_id, from_status, to_status, changed_at,
               {recorded}, {operational}, {legacy_device}, {operator}
        FROM _status_update_history_legacy;
        DROP TABLE _status_update_history_legacy;
        CREATE INDEX IF NOT EXISTS idx_status_update_history_task_id_changed_at
          ON status_update_history (task_id, changed_at DESC);
        """
    )


def migrate_mes_schema(conn):
    if DB_BACKEND == "postgres":
        with conn.cursor() as cur:
            migrate_devices_table(conn)
            cur.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'jobs'
                """
            )
            job_cols = {row[0] for row in cur.fetchall()}
            job_additions = {
                "total_requested_quantity": "INTEGER NOT NULL DEFAULT 1",
                "good_parts_count": "INTEGER NOT NULL DEFAULT 0",
                "scrap_parts_count": "INTEGER NOT NULL DEFAULT 0",
                "operator_id": "TEXT NOT NULL DEFAULT ''",
                "client_email": "TEXT NOT NULL DEFAULT ''",
                "tracking_mode": "TEXT NOT NULL DEFAULT 'unit'",
                "progress_percent": "INTEGER NOT NULL DEFAULT 0",
                "operations_checklist": "TEXT NOT NULL DEFAULT '[]'",
            }
            for name, typedef in job_additions.items():
                if name not in job_cols:
                    cur.execute(f"ALTER TABLE jobs ADD COLUMN {name} {typedef}")

            cur.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'status_update_history'
                """
            )
            hist_cols = {row[0] for row in cur.fetchall()}
            if "recorded_at" not in hist_cols:
                cur.execute(
                    "ALTER TABLE status_update_history ADD COLUMN recorded_at TIMESTAMPTZ"
                )
                cur.execute(
                    "UPDATE status_update_history SET recorded_at = changed_at "
                    "WHERE recorded_at IS NULL"
                )
            for name, typedef in {
                "operational_start_time": "TIMESTAMPTZ",
                "operator_id": "TEXT",
            }.items():
                if name not in hist_cols:
                    cur.execute(
                        f"ALTER TABLE status_update_history ADD COLUMN {name} {typedef}"
                    )
            if "device_name" not in hist_cols and "workstation_id" not in hist_cols:
                cur.execute(
                    "ALTER TABLE status_update_history ADD COLUMN device_name TEXT"
                )
            migrate_status_history_schema(conn)
        return

    migrate_devices_table(conn)
    columns = sqlite_columns(conn, "jobs")
    for name, typedef in {
        "total_requested_quantity": "INTEGER NOT NULL DEFAULT 1",
        "good_parts_count": "INTEGER NOT NULL DEFAULT 0",
        "scrap_parts_count": "INTEGER NOT NULL DEFAULT 0",
        "operator_id": "TEXT NOT NULL DEFAULT ''",
        "client_email": "TEXT NOT NULL DEFAULT ''",
        "tracking_mode": "TEXT NOT NULL DEFAULT 'unit'",
        "progress_percent": "INTEGER NOT NULL DEFAULT 0",
        "operations_checklist": "TEXT NOT NULL DEFAULT '[]'",
    }.items():
        if name not in columns:
            conn.execute(f"ALTER TABLE jobs ADD COLUMN {name} {typedef}")

    hist_columns = sqlite_columns(conn, "status_update_history")
    if "recorded_at" not in hist_columns:
        conn.execute(
            "ALTER TABLE status_update_history ADD COLUMN recorded_at TEXT"
        )
        conn.execute(
            "UPDATE status_update_history SET recorded_at = changed_at "
            "WHERE recorded_at IS NULL"
        )
    for name in ("operational_start_time", "operator_id"):
        if name not in hist_columns:
            conn.execute(f"ALTER TABLE status_update_history ADD COLUMN {name} TEXT")
    migrate_status_history_schema(conn)


def migrate_postgres_job_people_columns(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'jobs'
            """
        )
        columns = {row[0] for row in cur.fetchall()}
        if "author" not in columns:
            cur.execute(
                f"""
                ALTER TABLE jobs
                ADD COLUMN author TEXT NOT NULL DEFAULT '{DEFAULT_AUTHOR_NAME}'
                """
            )
        if "assignee_name" not in columns:
            cur.execute(
                f"""
                ALTER TABLE jobs
                ADD COLUMN assignee_name TEXT NOT NULL
                DEFAULT '{DEFAULT_ASSIGNEE_NAME}'
                """
            )
        if "assignee_photo" not in columns:
            cur.execute(
                f"""
                ALTER TABLE jobs
                ADD COLUMN assignee_photo TEXT NOT NULL
                DEFAULT '{DEFAULT_ASSIGNEE_PHOTO}'
                """
            )


def ensure_schema():
    if DB_BACKEND == "postgres":
        import psycopg2

        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM pg_type WHERE typname = 'job_status'")
                if cur.fetchone() is None:
                    cur.execute(
                        "CREATE TYPE job_status AS ENUM ("
                        "'pre_work', 'machining', 'qc', 'dispatch'"
                        ")"
                    )

                cur.execute(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'jobs'
                    """
                )
                job_columns = {row[0] for row in cur.fetchall()}

                if job_columns and "task_id" not in job_columns:
                    cur.execute("ALTER TABLE jobs RENAME TO jobs_legacy")
                    job_columns = set()

                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS jobs (
                      task_id         TEXT PRIMARY KEY,
                      job_id          TEXT NOT NULL,
                      client_phone    TEXT NOT NULL,
                      description     TEXT NOT NULL DEFAULT '',
                      author          TEXT NOT NULL DEFAULT 'Shop Floor',
                      assignee_name   TEXT NOT NULL DEFAULT 'Alex Chen',
                      assignee_photo  TEXT NOT NULL DEFAULT '',
                      status          job_status NOT NULL DEFAULT 'pre_work',
                      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                    )
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS status_update_history (
                      task_id       TEXT NOT NULL REFERENCES jobs (task_id) ON DELETE CASCADE,
                      from_status   job_status,
                      to_status     job_status NOT NULL,
                      changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
                      recorded_at   TIMESTAMPTZ,
                      operational_start_time TIMESTAMPTZ,
                      device_name   TEXT,
                      operator_id   TEXT
                    )
                    """
                )
                cur.execute("DROP TABLE IF EXISTS status_history")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status)")
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_jobs_client_phone ON jobs (client_phone)"
                )
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_status_update_history_task_id_changed_at
                    ON status_update_history (task_id, changed_at DESC)
                    """
                )

                cur.execute(
                    "SELECT 1 FROM information_schema.tables WHERE table_name = 'jobs_legacy'"
                )
                if cur.fetchone():
                    cur.execute(
                        """
                        SELECT job_id, client_phone, status, created_at, updated_at
                        FROM jobs_legacy
                        """
                    )
                    for row in cur.fetchall():
                        task_id = generate_task_id(conn)
                        cur.execute(
                            """
                            INSERT INTO jobs (
                              task_id, job_id, client_phone, description, status,
                              created_at, updated_at
                            )
                            VALUES (%s, %s, %s, '', %s, %s, %s)
                            """,
                            (task_id, row[0], row[1], row[2], row[3], row[4]),
                        )
                    cur.execute("DROP TABLE jobs_legacy")
                migrate_postgres_job_people_columns(conn)
                migrate_mes_schema(conn)
        return

    with get_db() as conn:
        conn.executescript(
            f"""
            CREATE TABLE IF NOT EXISTS jobs (
              task_id         TEXT PRIMARY KEY,
              job_id          TEXT NOT NULL,
              client_phone    TEXT NOT NULL,
              description     TEXT NOT NULL DEFAULT '',
              author          TEXT NOT NULL DEFAULT '{DEFAULT_AUTHOR_NAME.replace("'", "''")}',
              assignee_name   TEXT NOT NULL DEFAULT '{DEFAULT_ASSIGNEE_NAME.replace("'", "''")}',
              assignee_photo  TEXT NOT NULL DEFAULT '{DEFAULT_ASSIGNEE_PHOTO.replace("'", "''")}',
              status          TEXT NOT NULL DEFAULT 'pre_work'
                              CHECK (status IN ({VALID_STATUSES})),
              created_at      TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS status_update_history (
              task_id       TEXT NOT NULL REFERENCES jobs (task_id) ON DELETE CASCADE,
              from_status   TEXT CHECK (
                              from_status IS NULL OR from_status IN ({VALID_STATUSES})
                            ),
              to_status     TEXT NOT NULL CHECK (to_status IN ({VALID_STATUSES})),
              changed_at    TEXT NOT NULL DEFAULT (datetime('now')),
              recorded_at   TEXT,
              operational_start_time TEXT,
              device_name   TEXT,
              operator_id   TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
            CREATE INDEX IF NOT EXISTS idx_jobs_client_phone ON jobs (client_phone);
            CREATE INDEX IF NOT EXISTS idx_status_update_history_task_id_changed_at
              ON status_update_history (task_id, changed_at DESC);
            """
        )
        migrate_sqlite_schema(conn)
        migrate_job_people_columns(conn)
        migrate_mes_schema(conn)


def parse_operational_start(value):
    now = datetime.now(timezone.utc)
    if value is None:
        return now
    preset = str(value).strip().lower()
    if not preset or preset == "now":
        return now
    if preset == "30m_ago":
        return now - timedelta(minutes=30)
    if preset == "60m_ago":
        return now - timedelta(minutes=60)
    parsed = as_datetime(value)
    return parsed if parsed else now


def register_device(device_name):
    device_name = device_name.strip()
    if not device_name:
        return None, "device_id is required."

    with get_db() as conn:
        if DB_BACKEND == "postgres":
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT device_token FROM devices WHERE device_name = %s",
                    (device_name,),
                )
                row = cur.fetchone()
                if row:
                    return {
                        "device_name": device_name,
                        "device_token": row[0],
                    }, None
        else:
            row = conn.execute(
                "SELECT device_token FROM devices WHERE device_name = ?",
                (device_name,),
            ).fetchone()
            if row:
                return {
                    "device_name": device_name,
                    "device_token": row["device_token"],
                }, None

        device_token = generate_device_token()
        if DB_BACKEND == "postgres":
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO devices (device_name, device_token)
                    VALUES (%s, %s)
                    """,
                    (device_name, device_token),
                )
        else:
            conn.execute(
                """
                INSERT INTO devices (device_name, device_token)
                VALUES (?, ?)
                """,
                (device_name, device_token),
            )

    return {
        "device_name": device_name,
        "device_token": device_token,
    }, None


def fetch_device_by_token(device_token):
    with get_db() as conn:
        if DB_BACKEND == "postgres":
            import psycopg2.extras

            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT device_name, device_token, created_at
                    FROM devices WHERE device_token = %s
                    """,
                    (device_token,),
                )
                row = cur.fetchone()
        else:
            row = conn.execute(
                """
                SELECT device_name, device_token, created_at
                FROM devices WHERE device_token = ?
                """,
                (device_token,),
            ).fetchone()
            row = dict(row) if row else None
    return dict(row) if row else None


def require_device():
    payload = request.get_json(silent=True) or {}
    token = extract_device_token(request.headers, payload, request.cookies)
    if not token:
        return None, (jsonify({"error": "Device token required."}), 401)
    device = fetch_device_by_token(token)
    if not device:
        return None, (jsonify({"error": "Invalid device token."}), 401)
    return device, None


def parse_checklist(value):
    if isinstance(value, list):
        return value
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return []
    return parsed if isinstance(parsed, list) else []


def row_to_job(row):
    job = dict(row) if not isinstance(row, dict) else row
    return {
        "task_id": job["task_id"],
        "job_id": job["job_id"],
        "client_phone": job["client_phone"],
        "client_email": job.get("client_email") or "",
        "description": job.get("description") or "",
        "author": job.get("author") or DEFAULT_AUTHOR_NAME,
        "assignee_name": job.get("assignee_name") or DEFAULT_ASSIGNEE_NAME,
        "assignee_photo": job.get("assignee_photo") or DEFAULT_ASSIGNEE_PHOTO,
        "total_requested_quantity": int(job.get("total_requested_quantity") or 1),
        "good_parts_count": int(job.get("good_parts_count") or 0),
        "scrap_parts_count": int(job.get("scrap_parts_count") or 0),
        "operator_id": job.get("operator_id") or "",
        "tracking_mode": job.get("tracking_mode") or "unit",
        "progress_percent": int(job.get("progress_percent") or 0),
        "operations_checklist": parse_checklist(job.get("operations_checklist")),
        "status": job["status"],
        "status_label": STATUS_LABELS.get(job["status"], job["status"]),
        "created_at": as_datetime(job["created_at"]),
        "updated_at": as_datetime(job["updated_at"]),
    }


JOB_SELECT_COLUMNS = (
    "task_id, job_id, client_phone, client_email, description, author, "
    "assignee_name, assignee_photo, total_requested_quantity, good_parts_count, "
    "scrap_parts_count, operator_id, tracking_mode, progress_percent, "
    "operations_checklist, status, created_at, updated_at"
)


def fetch_jobs():
    with get_db() as conn:
        if DB_BACKEND == "postgres":
            import psycopg2.extras

            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    f"""
                    SELECT {JOB_SELECT_COLUMNS}
                    FROM jobs
                    ORDER BY updated_at DESC
                    """
                )
                rows = cur.fetchall()
        else:
            cur = conn.execute(
                f"""
                SELECT {JOB_SELECT_COLUMNS}
                FROM jobs
                ORDER BY updated_at DESC
                """
            )
            rows = [dict(row) for row in cur.fetchall()]

    return [row_to_job(row) for row in rows]


def fetch_job_by_task_id(task_id):
    with get_db() as conn:
        if DB_BACKEND == "postgres":
            import psycopg2.extras

            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    f"""
                    SELECT {JOB_SELECT_COLUMNS}
                    FROM jobs
                    WHERE task_id = %s
                    """,
                    (task_id,),
                )
                row = cur.fetchone()
        else:
            row = conn.execute(
                f"""
                SELECT {JOB_SELECT_COLUMNS}
                FROM jobs
                WHERE task_id = ?
                """,
                (task_id,),
            ).fetchone()
            row = dict(row) if row else None

    return row_to_job(row) if row else None


def create_job(
    job_id,
    client_phone,
    description="",
    author=None,
    assignee_name=None,
    assignee_photo=None,
    total_requested_quantity=1,
    client_email="",
    tracking_mode="unit",
):
    author = author or DEFAULT_AUTHOR_NAME
    assignee_name = assignee_name or DEFAULT_ASSIGNEE_NAME
    assignee_photo = assignee_photo or DEFAULT_ASSIGNEE_PHOTO
    tracking_mode = tracking_mode if tracking_mode in TRACKING_MODES else "unit"
    total_requested_quantity = max(1, int(total_requested_quantity or 1))

    with get_db() as conn:
        task_id = generate_task_id(conn)
        recorded_at = datetime.now(timezone.utc)
        if DB_BACKEND == "postgres":
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO jobs (
                      task_id, job_id, client_phone, client_email, description,
                      author, assignee_name, assignee_photo,
                      total_requested_quantity, tracking_mode, status
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pre_work')
                    """,
                    (
                        task_id,
                        job_id,
                        client_phone,
                        client_email or "",
                        description or "",
                        author,
                        assignee_name,
                        assignee_photo,
                        total_requested_quantity,
                        tracking_mode,
                    ),
                )
                cur.execute(
                    """
                    INSERT INTO status_update_history (
                      task_id, from_status, to_status, changed_at,
                      recorded_at, operational_start_time
                    )
                    VALUES (%s, NULL, 'pre_work', %s, %s, %s)
                    """,
                    (task_id, recorded_at, recorded_at, recorded_at),
                )
        else:
            ts = recorded_at.isoformat()
            conn.execute(
                """
                INSERT INTO jobs (
                  task_id, job_id, client_phone, client_email, description,
                  author, assignee_name, assignee_photo,
                  total_requested_quantity, tracking_mode, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pre_work')
                """,
                (
                    task_id,
                    job_id,
                    client_phone,
                    client_email or "",
                    description or "",
                    author,
                    assignee_name,
                    assignee_photo,
                    total_requested_quantity,
                    tracking_mode,
                ),
            )
            conn.execute(
                """
                INSERT INTO status_update_history (
                  task_id, from_status, to_status, changed_at,
                  recorded_at, operational_start_time
                )
                VALUES (?, NULL, 'pre_work', ?, ?, ?)
                """,
                (task_id, ts, ts, ts),
            )
        return task_id


def update_job(
    task_id,
    job_id=None,
    client_phone=None,
    client_email=None,
    description=None,
    assignee_name=None,
    assignee_photo=None,
    total_requested_quantity=None,
    good_parts_count=None,
    scrap_parts_count=None,
    operator_id=None,
    tracking_mode=None,
    progress_percent=None,
    operations_checklist=None,
):
    fields = []
    values = []

    if job_id is not None:
        job_id = job_id.strip()
        if not job_id:
            return None, "Job ID cannot be empty."
        fields.append("job_id")
        values.append(job_id)

    if client_phone is not None:
        client_phone = client_phone.strip()
        if not client_phone:
            return None, "Client phone cannot be empty."
        fields.append("client_phone")
        values.append(client_phone)

    if description is not None:
        fields.append("description")
        values.append(description.strip())

    if assignee_name is not None:
        assignee_name = assignee_name.strip()
        if not assignee_name:
            return None, "Assignee name cannot be empty."
        fields.append("assignee_name")
        values.append(assignee_name)

    if assignee_photo is not None:
        fields.append("assignee_photo")
        values.append(assignee_photo.strip())

    if client_email is not None:
        fields.append("client_email")
        values.append(client_email.strip())

    if total_requested_quantity is not None:
        fields.append("total_requested_quantity")
        values.append(max(1, int(total_requested_quantity)))

    if good_parts_count is not None:
        fields.append("good_parts_count")
        values.append(max(0, int(good_parts_count)))

    if scrap_parts_count is not None:
        fields.append("scrap_parts_count")
        values.append(max(0, int(scrap_parts_count)))

    if operator_id is not None:
        fields.append("operator_id")
        values.append(operator_id.strip())

    if tracking_mode is not None:
        if tracking_mode not in TRACKING_MODES:
            return None, "Invalid tracking_mode."
        fields.append("tracking_mode")
        values.append(tracking_mode)

    if progress_percent is not None:
        fields.append("progress_percent")
        values.append(min(100, max(0, int(progress_percent))))

    if operations_checklist is not None:
        fields.append("operations_checklist")
        values.append(
            json.dumps(operations_checklist)
            if isinstance(operations_checklist, list)
            else operations_checklist
        )

    if not fields:
        return fetch_job_by_task_id(task_id), None

    changed_at = datetime.now(timezone.utc)
    fields.append("updated_at")
    values.append(changed_at if DB_BACKEND == "postgres" else changed_at.isoformat())
    values.append(task_id)

    with get_db() as conn:
        if DB_BACKEND == "postgres":
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM jobs WHERE task_id = %s", (task_id,))
                if cur.fetchone() is None:
                    return None, "Job not found."
                set_clause = ", ".join(f"{name} = %s" for name in fields)
                cur.execute(
                    f"UPDATE jobs SET {set_clause} WHERE task_id = %s",
                    values,
                )
        else:
            row = conn.execute(
                "SELECT 1 FROM jobs WHERE task_id = ?",
                (task_id,),
            ).fetchone()
            if row is None:
                return None, "Job not found."
            set_clause = ", ".join(f"{name} = ?" for name in fields)
            conn.execute(
                f"UPDATE jobs SET {set_clause} WHERE task_id = ?",
                values,
            )

    return fetch_job_by_task_id(task_id), None


def delete_job(task_id):
    with get_db() as conn:
        if DB_BACKEND == "postgres":
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM jobs WHERE task_id = %s", (task_id,))
                if cur.fetchone() is None:
                    return False
                cur.execute("DELETE FROM jobs WHERE task_id = %s", (task_id,))
        else:
            row = conn.execute(
                "SELECT 1 FROM jobs WHERE task_id = ?",
                (task_id,),
            ).fetchone()
            if row is None:
                return False
            conn.execute("DELETE FROM jobs WHERE task_id = ?", (task_id,))
    return True


def set_job_status(
    task_id,
    new_status,
    *,
    device_name=None,
    operator_id=None,
    operational_start=None,
):
    if new_status not in STATUS_ORDER:
        return None, "Invalid status."

    recorded_at = datetime.now(timezone.utc)
    operational_start_time = parse_operational_start(operational_start)

    with get_db() as conn:
        if DB_BACKEND == "postgres":
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status FROM jobs WHERE task_id = %s FOR UPDATE",
                    (task_id,),
                )
                row = cur.fetchone()
        else:
            row = conn.execute(
                "SELECT status FROM jobs WHERE task_id = ?",
                (task_id,),
            ).fetchone()
            row = (row["status"],) if row else None

        if row is None:
            return None, "Job not found."

        current_status = row[0]
        if current_status == new_status:
            return new_status, None

        if DB_BACKEND == "postgres":
            with conn.cursor() as cur:
                if operator_id:
                    cur.execute(
                        """
                        UPDATE jobs
                        SET status = %s, updated_at = %s, operator_id = %s
                        WHERE task_id = %s
                        """,
                        (new_status, recorded_at, operator_id, task_id),
                    )
                else:
                    cur.execute(
                        """
                        UPDATE jobs
                        SET status = %s, updated_at = %s
                        WHERE task_id = %s
                        """,
                        (new_status, recorded_at, task_id),
                    )
                cur.execute(
                    """
                    INSERT INTO status_update_history (
                      task_id, from_status, to_status, changed_at,
                      recorded_at, operational_start_time, device_name, operator_id
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        task_id,
                        current_status,
                        new_status,
                        recorded_at,
                        recorded_at,
                        operational_start_time,
                        device_name,
                        operator_id,
                    ),
                )
        else:
            ts = recorded_at.isoformat()
            op_ts = operational_start_time.isoformat()
            if operator_id:
                conn.execute(
                    """
                    UPDATE jobs
                    SET status = ?, updated_at = ?, operator_id = ?
                    WHERE task_id = ?
                    """,
                    (new_status, ts, operator_id, task_id),
                )
            else:
                conn.execute(
                    """
                    UPDATE jobs
                    SET status = ?, updated_at = ?
                    WHERE task_id = ?
                    """,
                    (new_status, ts, task_id),
                )
            conn.execute(
                """
                INSERT INTO status_update_history (
                  task_id, from_status, to_status, changed_at,
                  recorded_at, operational_start_time, device_name, operator_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task_id,
                    current_status,
                    new_status,
                    ts,
                    ts,
                    op_ts,
                    device_name,
                    operator_id,
                ),
            )

    job = fetch_job_by_task_id(task_id)
    if job:
        dispatch_status_change_async(
            batch_id=task_id,
            from_status=current_status,
            to_status=new_status,
            job=job_payload(job),
            status_labels=STATUS_LABELS,
            device_name=device_name,
            operator_id=operator_id or job.get("operator_id"),
        )

    return new_status, None


def resolve_task_id(identifier):
    identifier = (identifier or "").strip()
    if not identifier:
        return None

    if fetch_job_by_task_id(identifier):
        return identifier

    with get_db() as conn:
        if DB_BACKEND == "postgres":
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT task_id FROM jobs WHERE job_id = %s",
                    (identifier,),
                )
                row = cur.fetchone()
        else:
            row = conn.execute(
                "SELECT task_id FROM jobs WHERE job_id = ?",
                (identifier,),
            ).fetchone()
            row = (row["task_id"],) if row else None

    return row[0] if row else None


def parse_scan_raw(raw):
    """Return (task_id, status_override) from QR text."""
    raw = (raw or "").strip()
    if not raw:
        return None, None

    if raw.startswith("{"):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return None, None
        if isinstance(data, dict):
            task_id = (
                data.get("task_id")
                or data.get("taskId")
                or data.get("id")
                or ""
            )
            task_id = str(task_id).strip()
            status = data.get("status") or data.get("station")
            if status:
                status = str(status).strip().lower()
            return (task_id or None), status
        return None, None

    return raw, None


def move_job_status(task_id, direction=1):
    if direction not in (1, -1):
        return None, "Invalid move direction."

    with get_db() as conn:
        if DB_BACKEND == "postgres":
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status FROM jobs WHERE task_id = %s FOR UPDATE",
                    (task_id,),
                )
                row = cur.fetchone()
        else:
            row = conn.execute(
                "SELECT status FROM jobs WHERE task_id = ?",
                (task_id,),
            ).fetchone()
            row = (row["status"],) if row else None

        if row is None:
            return None, "Job not found."

        current_status = row[0]
        try:
            current_index = STATUS_ORDER.index(current_status)
        except ValueError:
            return None, "Unknown job status."

        new_index = current_index + direction
        if new_index < 0:
            return None, "Job is already at the first stage."
        if new_index >= len(STATUS_ORDER):
            return None, "Job is already at the final stage."

        new_status = STATUS_ORDER[new_index]
        return set_job_status(task_id, new_status)


def advance_job_status(task_id):
    return move_job_status(task_id, direction=1)


def revert_job_status(task_id):
    return move_job_status(task_id, direction=-1)


def job_payload(job):
    return {
        "task_id": job["task_id"],
        "job_id": job["job_id"],
        "client_phone": job["client_phone"],
        "client_email": job.get("client_email") or "",
        "description": job["description"],
        "author": job["author"],
        "assignee_name": job["assignee_name"],
        "assignee_photo": job["assignee_photo"],
        "total_requested_quantity": job.get("total_requested_quantity", 1),
        "good_parts_count": job.get("good_parts_count", 0),
        "scrap_parts_count": job.get("scrap_parts_count", 0),
        "operator_id": job.get("operator_id") or "",
        "tracking_mode": job.get("tracking_mode") or "unit",
        "progress_percent": job.get("progress_percent", 0),
        "operations_checklist": job.get("operations_checklist") or [],
        "status": job["status"],
        "status_label": job["status_label"],
        "created_at": job["created_at"].isoformat(),
        "updated_at": job["updated_at"].isoformat(),
    }


@app.route("/")
def index():
    react_index = REACT_DIST / "index.html"
    if react_index.exists():
        return send_from_directory(REACT_DIST, "index.html")

    jobs = fetch_jobs()
    columns = {status: [] for status in STATUS_ORDER}
    for job in jobs:
        columns[job["status"]].append(job)

    return render_template(
        "index.html",
        statuses=STATUSES,
        status_labels=STATUS_LABELS,
        columns=columns,
        jobs=jobs,
    )


@app.route("/scan")
@app.route("/floor/scan")
def floor_scan_page():
    """Mobile-only QR scanner; station from ?station=machining etc."""
    return render_template("floor-scan.html", statuses=STATUSES, status_labels=STATUS_LABELS)


@app.route("/api/devices/register", methods=["POST"])
def api_register_device():
    payload = request.get_json(silent=True) or {}
    device_id = (payload.get("device_id") or "").strip()
    result, error = register_device(device_id)
    if error:
        return jsonify({"error": error}), 400
    response = jsonify(
        {
            "device_id": result["device_name"],
            "device_token": result["device_token"],
        }
    )
    response.status_code = 201
    response.set_cookie(
        DEVICE_TOKEN_COOKIE,
        result["device_token"],
        max_age=60 * 60 * 24 * 365,
        samesite="Lax",
        secure=request.is_secure,
    )
    return response


@app.route("/api/devices/me", methods=["GET"])
def api_device_me():
    token = extract_device_token(request.headers, {}, request.cookies)
    if not token:
        return jsonify({"error": "Device token required."}), 401
    device = fetch_device_by_token(token)
    if not device:
        return jsonify({"error": "Invalid device token."}), 401
    return jsonify({"device_id": device["device_name"]})


@app.route("/api/floor/scan", methods=["POST"])
def floor_scan_move():
    """
    Shop-floor scan: device token required.
    Body: { "raw": "<qr text>", "station": "qc", "operator_id": "BADGE-1",
            "operational_start": "30m_ago" }.
    """
    device, auth_error = require_device()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or {}
    raw = (payload.get("raw") or "").strip()
    station = (
        (payload.get("station") or request.args.get("station") or "").strip().lower()
    )
    explicit_task_id = (payload.get("task_id") or "").strip()

    parsed_id, status_override = parse_scan_raw(raw)
    task_id = explicit_task_id or parsed_id
    if status_override and status_override in STATUS_ORDER:
        station = status_override

    if not task_id:
        return jsonify({"error": "Could not read task ID from scan."}), 400
    if station not in STATUS_ORDER:
        return jsonify({"error": "Invalid or missing station."}), 400

    resolved = resolve_task_id(task_id)
    if not resolved:
        return jsonify({"error": "Task not found."}), 404

    job_before = fetch_job_by_task_id(resolved)
    if not job_before:
        return jsonify({"error": "Task not found."}), 404

    from_status = job_before["status"]
    from_label = STATUS_LABELS.get(from_status, from_status)
    to_label = STATUS_LABELS.get(station, station)

    if from_status == station:
        return jsonify(
            {
                "ok": True,
                "unchanged": True,
                "task_id": resolved,
                "job_id": job_before["job_id"],
                "from_status": from_status,
                "from_status_label": from_label,
                "to_status": station,
                "to_status_label": to_label,
                "device_name": device["device_name"],
            }
        )

    # Phone registration name doubles as operator identity on the floor.
    operator_id = (
        (payload.get("operator_id") or "").strip()
        or device["device_name"]
    )
    operational_start = payload.get("operational_start")
    _, error = set_job_status(
        resolved,
        station,
        device_name=device["device_name"],
        operator_id=operator_id,
        operational_start=operational_start,
    )
    if error:
        return jsonify({"error": error}), 400

    job = fetch_job_by_task_id(resolved)
    return jsonify(
        {
            "ok": True,
            "unchanged": False,
            "task_id": resolved,
            "batch_id": resolved,
            "device_name": device["device_name"],
            "operator_id": operator_id,
            "job_id": job["job_id"] if job else None,
            "from_status": from_status,
            "from_status_label": from_label,
            "to_status": station,
            "to_status_label": to_label,
            "status": station,
            "status_label": to_label,
            "job": job_payload(job) if job else None,
        }
    )


@app.route("/assets/<path:filename>")
def react_assets(filename):
    return send_from_directory(REACT_DIST / "assets", filename)


@app.route("/jobs", methods=["POST"])
def add_job():
    payload = request.get_json(silent=True) or {}
    job_id = (request.form.get("job_id") or payload.get("job_id") or "").strip()
    client_phone = (
        request.form.get("client_phone") or payload.get("client_phone") or ""
    ).strip()
    description = (
        request.form.get("description") or payload.get("description") or ""
    ).strip()
    assignee_name = (
        request.form.get("assignee_name") or payload.get("assignee_name") or ""
    ).strip() or None
    assignee_photo = (
        request.form.get("assignee_photo") or payload.get("assignee_photo") or ""
    ).strip() or None

    if not job_id or not client_phone:
        if request.accept_mimetypes.best == "application/json":
            return jsonify({"error": "job_id and client_phone are required"}), 400
        return redirect(url_for("index"))

    try:
        task_id = create_job(
            job_id,
            client_phone,
            description=description,
            assignee_name=assignee_name,
            assignee_photo=assignee_photo,
        )
    except sqlite3.IntegrityError:
        task_id = None
    except Exception as exc:
        if exc.__class__.__name__ == "IntegrityError":
            task_id = None
        else:
            raise

    if request.accept_mimetypes.best == "application/json":
        if task_id is None:
            return jsonify({"error": "Could not create job"}), 400
        job = fetch_job_by_task_id(task_id)
        return jsonify(job_payload(job)), 201
    return redirect(url_for("index"))


@app.route("/api/jobs/<task_id>", methods=["PATCH", "DELETE"])
def job_detail(task_id):
    if request.method == "DELETE":
        if not delete_job(task_id):
            return jsonify({"error": "Job not found"}), 404
        return jsonify({"ok": True})

    payload = request.get_json(silent=True) or {}
    has_fields = any(
        key in payload
        for key in (
            "job_id",
            "client_phone",
            "client_email",
            "description",
            "assignee_name",
            "assignee_photo",
            "total_requested_quantity",
            "good_parts_count",
            "scrap_parts_count",
            "operator_id",
            "tracking_mode",
            "progress_percent",
            "operations_checklist",
        )
    )

    if has_fields:
        job, error = update_job(
            task_id,
            job_id=payload.get("job_id") if "job_id" in payload else None,
            client_phone=payload.get("client_phone")
            if "client_phone" in payload
            else None,
            client_email=payload.get("client_email")
            if "client_email" in payload
            else None,
            description=payload.get("description")
            if "description" in payload
            else None,
            assignee_name=payload.get("assignee_name")
            if "assignee_name" in payload
            else None,
            assignee_photo=payload.get("assignee_photo")
            if "assignee_photo" in payload
            else None,
            total_requested_quantity=payload.get("total_requested_quantity")
            if "total_requested_quantity" in payload
            else None,
            good_parts_count=payload.get("good_parts_count")
            if "good_parts_count" in payload
            else None,
            scrap_parts_count=payload.get("scrap_parts_count")
            if "scrap_parts_count" in payload
            else None,
            operator_id=payload.get("operator_id")
            if "operator_id" in payload
            else None,
            tracking_mode=payload.get("tracking_mode")
            if "tracking_mode" in payload
            else None,
            progress_percent=payload.get("progress_percent")
            if "progress_percent" in payload
            else None,
            operations_checklist=payload.get("operations_checklist")
            if "operations_checklist" in payload
            else None,
        )
        if error:
            return jsonify({"error": error}), 400
        if job is None:
            return jsonify({"error": "Job not found"}), 404

    if "status" in payload:
        new_status = (payload.get("status") or "").strip()
        _, error = set_job_status(task_id, new_status)
        if error:
            return jsonify({"error": error}), 400

    job = fetch_job_by_task_id(task_id)
    if job is None:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job_payload(job))


@app.route("/jobs/<task_id>/move", methods=["POST"])
def move_job(task_id):
    device, auth_error = require_device()
    if auth_error:
        return auth_error

    payload = request.get_json(silent=True) or {}
    new_status = (request.form.get("status") or payload.get("status") or "").strip()
    operator_id = (payload.get("operator_id") or "").strip() or None

    _, error = set_job_status(
        task_id,
        new_status,
        device_name=device["device_name"],
        operator_id=operator_id,
        operational_start=payload.get("operational_start"),
    )
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"ok": True, "status": new_status})


@app.route("/jobs/<task_id>/advance", methods=["POST"])
def advance_job(task_id):
    _, error = advance_job_status(task_id)
    if error and request.accept_mimetypes.best == "application/json":
        return jsonify({"error": error}), 400
    if request.accept_mimetypes.best == "application/json":
        return jsonify({"ok": True})
    return redirect(url_for("index"))


@app.route("/jobs/<task_id>/revert", methods=["POST"])
def revert_job(task_id):
    _, error = revert_job_status(task_id)
    if error and request.accept_mimetypes.best == "application/json":
        return jsonify({"error": error}), 400
    if request.accept_mimetypes.best == "application/json":
        return jsonify({"ok": True})
    return redirect(url_for("index"))


@app.route("/api/jobs")
def api_jobs():
    jobs = fetch_jobs()
    return jsonify([job_payload(job) for job in jobs])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ensure_n8n_running()
    configure_database()
    ensure_schema()
    if os.environ.get("WEBHOOK_URL", "").strip():
        logging.info("Status webhooks enabled for: %s", os.environ["WEBHOOK_URL"])
    else:
        logging.info("WEBHOOK_URL not set — status webhooks disabled")
    app.run(debug=True, host="0.0.0.0", port=5000)
