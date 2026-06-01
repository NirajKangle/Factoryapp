import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, send_from_directory, url_for

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SQLITE_PATH = BASE_DIR / "midc_shop.db"
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

DB_BACKEND = "sqlite"
DB_TARGET = str(DEFAULT_SQLITE_PATH)


def resolve_db_config():
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if database_url.startswith(("postgresql://", "postgres://")):
        return "postgres", database_url
    if database_url.startswith("sqlite:///"):
        return "sqlite", database_url.removeprefix("sqlite:///")
    return "sqlite", str(DEFAULT_SQLITE_PATH)


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
                    CREATE TABLE IF NOT EXISTS jobs (
                      job_id        TEXT PRIMARY KEY,
                      client_phone  TEXT NOT NULL,
                      status        job_status NOT NULL DEFAULT 'pre_work',
                      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
                      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
                    )
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS status_history (
                      id            BIGSERIAL PRIMARY KEY,
                      job_id        TEXT NOT NULL REFERENCES jobs (job_id) ON DELETE CASCADE,
                      from_status   job_status,
                      to_status     job_status NOT NULL,
                      changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
                      notes         TEXT
                    )
                    """
                )
                cur.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status)")
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_jobs_client_phone ON jobs (client_phone)"
                )
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_status_history_job_id_changed_at
                    ON status_history (job_id, changed_at DESC)
                    """
                )
        return

    with get_db() as conn:
        conn.executescript(
            f"""
            CREATE TABLE IF NOT EXISTS jobs (
              job_id        TEXT PRIMARY KEY,
              client_phone  TEXT NOT NULL,
              status        TEXT NOT NULL DEFAULT 'pre_work'
                            CHECK (status IN ({VALID_STATUSES})),
              created_at    TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS status_history (
              id            INTEGER PRIMARY KEY AUTOINCREMENT,
              job_id        TEXT NOT NULL REFERENCES jobs (job_id) ON DELETE CASCADE,
              from_status   TEXT CHECK (
                              from_status IS NULL OR from_status IN ({VALID_STATUSES})
                            ),
              to_status     TEXT NOT NULL CHECK (to_status IN ({VALID_STATUSES})),
              changed_at    TEXT NOT NULL DEFAULT (datetime('now')),
              notes         TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
            CREATE INDEX IF NOT EXISTS idx_jobs_client_phone ON jobs (client_phone);
            CREATE INDEX IF NOT EXISTS idx_status_history_job_id_changed_at
              ON status_history (job_id, changed_at DESC);
            """
        )


def fetch_jobs():
    with get_db() as conn:
        if DB_BACKEND == "postgres":
            import psycopg2.extras

            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT job_id, client_phone, status, created_at, updated_at
                    FROM jobs
                    ORDER BY updated_at DESC
                    """
                )
                rows = cur.fetchall()
        else:
            cur = conn.execute(
                """
                SELECT job_id, client_phone, status, created_at, updated_at
                FROM jobs
                ORDER BY updated_at DESC
                """
            )
            rows = [dict(row) for row in cur.fetchall()]

    for row in rows:
        row["created_at"] = as_datetime(row["created_at"])
        row["updated_at"] = as_datetime(row["updated_at"])
    return rows


def create_job(job_id, client_phone):
    with get_db() as conn:
        if DB_BACKEND == "postgres":
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO jobs (job_id, client_phone, status)
                    VALUES (%s, %s, 'pre_work')
                    """,
                    (job_id, client_phone),
                )
                cur.execute(
                    """
                    INSERT INTO status_history (job_id, from_status, to_status)
                    VALUES (%s, NULL, 'pre_work')
                    """,
                    (job_id,),
                )
        else:
            conn.execute(
                """
                INSERT INTO jobs (job_id, client_phone, status)
                VALUES (?, ?, 'pre_work')
                """,
                (job_id, client_phone),
            )
            conn.execute(
                """
                INSERT INTO status_history (job_id, from_status, to_status)
                VALUES (?, NULL, 'pre_work')
                """,
                (job_id,),
            )


def set_job_status(job_id, new_status, notes=None):
    if new_status not in STATUS_ORDER:
        return None, "Invalid status."

    with get_db() as conn:
        if DB_BACKEND == "postgres":
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status FROM jobs WHERE job_id = %s FOR UPDATE",
                    (job_id,),
                )
                row = cur.fetchone()
        else:
            row = conn.execute(
                "SELECT status FROM jobs WHERE job_id = ?",
                (job_id,),
            ).fetchone()
            row = (row["status"],) if row else None

        if row is None:
            return None, "Job not found."

        current_status = row[0]
        if current_status == new_status:
            return new_status, None

        changed_at = datetime.now(timezone.utc)

        if DB_BACKEND == "postgres":
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE jobs
                    SET status = %s, updated_at = %s
                    WHERE job_id = %s
                    """,
                    (new_status, changed_at, job_id),
                )
                cur.execute(
                    """
                    INSERT INTO status_history (job_id, from_status, to_status, changed_at, notes)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (job_id, current_status, new_status, changed_at, notes or None),
                )
        else:
            conn.execute(
                """
                UPDATE jobs
                SET status = ?, updated_at = ?
                WHERE job_id = ?
                """,
                (new_status, changed_at.isoformat(), job_id),
            )
            conn.execute(
                """
                INSERT INTO status_history (job_id, from_status, to_status, changed_at, notes)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    current_status,
                    new_status,
                    changed_at.isoformat(),
                    notes or None,
                ),
            )

        return new_status, None


def move_job_status(job_id, direction=1, notes=None):
    if direction not in (1, -1):
        return None, "Invalid move direction."

    with get_db() as conn:
        if DB_BACKEND == "postgres":
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status FROM jobs WHERE job_id = %s FOR UPDATE",
                    (job_id,),
                )
                row = cur.fetchone()
        else:
            row = conn.execute(
                "SELECT status FROM jobs WHERE job_id = ?",
                (job_id,),
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
        return set_job_status(job_id, new_status, notes=notes)


def advance_job_status(job_id, notes=None):
    return move_job_status(job_id, direction=1, notes=notes)


def revert_job_status(job_id, notes=None):
    return move_job_status(job_id, direction=-1, notes=notes)


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


@app.route("/assets/<path:filename>")
def react_assets(filename):
    return send_from_directory(REACT_DIST / "assets", filename)


@app.route("/jobs", methods=["POST"])
def add_job():
    job_id = request.form.get("job_id", "").strip()
    client_phone = request.form.get("client_phone", "").strip()

    if not job_id or not client_phone:
        if request.accept_mimetypes.best == "application/json":
            return jsonify({"error": "job_id and client_phone are required"}), 400
        return redirect(url_for("index"))

    try:
        create_job(job_id, client_phone)
    except sqlite3.IntegrityError:
        pass
    except Exception as exc:
        if exc.__class__.__name__ == "IntegrityError":
            pass
        else:
            raise

    if request.accept_mimetypes.best == "application/json":
        return jsonify({"ok": True}), 201
    return redirect(url_for("index"))


@app.route("/jobs/<job_id>/move", methods=["POST"])
def move_job(job_id):
    payload = request.get_json(silent=True) or {}
    new_status = (request.form.get("status") or payload.get("status") or "").strip()
    notes = request.form.get("notes", "").strip() or payload.get("notes") or None

    _, error = set_job_status(job_id, new_status, notes=notes)
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"ok": True, "status": new_status})


@app.route("/jobs/<job_id>/advance", methods=["POST"])
def advance_job(job_id):
    notes = request.form.get("notes", "").strip() or None
    _, error = advance_job_status(job_id, notes=notes)
    if error and request.accept_mimetypes.best == "application/json":
        return jsonify({"error": error}), 400
    if request.accept_mimetypes.best == "application/json":
        return jsonify({"ok": True})
    return redirect(url_for("index"))


@app.route("/jobs/<job_id>/revert", methods=["POST"])
def revert_job(job_id):
    notes = request.form.get("notes", "").strip() or None
    _, error = revert_job_status(job_id, notes=notes)
    if error and request.accept_mimetypes.best == "application/json":
        return jsonify({"error": error}), 400
    if request.accept_mimetypes.best == "application/json":
        return jsonify({"ok": True})
    return redirect(url_for("index"))


@app.route("/api/jobs")
def api_jobs():
    jobs = fetch_jobs()
    payload = []
    for job in jobs:
        payload.append(
            {
                "job_id": job["job_id"],
                "client_phone": job["client_phone"],
                "status": job["status"],
                "status_label": STATUS_LABELS.get(job["status"], job["status"]),
                "created_at": job["created_at"].isoformat(),
                "updated_at": job["updated_at"].isoformat(),
            }
        )
    return jsonify(payload)


if __name__ == "__main__":
    configure_database()
    ensure_schema()
    app.run(debug=True, host="0.0.0.0", port=5000)
