"""Process workflows: per-factory custom status pipelines."""

import re
from datetime import datetime, timezone

DEFAULT_PROCESS_NAME = "General"

DEFAULT_PROCESS_STATUSES = [
    ("pre_work", "Pre-Work", "#6366f1"),
    ("machining", "Machining", "#f59e0b"),
    ("qc", "QC", "#10b981"),
    ("dispatch", "Dispatch", "#22c55e"),
]

STATUS_COLOR_PALETTE = [
    "#6366f1",
    "#f59e0b",
    "#10b981",
    "#22c55e",
    "#ec4899",
    "#8b5cf6",
    "#06b6d4",
    "#f97316",
]


def _now(db_backend):
    ts = datetime.now(timezone.utc)
    return ts if db_backend == "postgres" else ts.isoformat()


def slugify_status_key(label, existing_keys):
    base = re.sub(r"[^a-z0-9]+", "_", (label or "").lower()).strip("_") or "step"
    key = base
    suffix = 2
    while key in existing_keys:
        key = f"{base}_{suffix}"
        suffix += 1
    return key


def _sqlite_columns(conn, table_name):
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {row[1] for row in rows}


def _sqlite_table_exists(conn, table_name):
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def ensure_processes_schema(conn, db_backend):
    if db_backend == "postgres":
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS processes (
                  process_id   SERIAL PRIMARY KEY,
                  name         TEXT NOT NULL UNIQUE,
                  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
                  modified_at  TIMESTAMPTZ
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS process_statuses (
                  status_id    SERIAL PRIMARY KEY,
                  process_id   INTEGER NOT NULL REFERENCES processes (process_id) ON DELETE CASCADE,
                  status_key   TEXT NOT NULL,
                  label        TEXT NOT NULL,
                  sort_order   INTEGER NOT NULL DEFAULT 0,
                  color        TEXT NOT NULL DEFAULT '#6366f1',
                  UNIQUE (process_id, status_key),
                  UNIQUE (process_id, label)
                )
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_process_statuses_process_id "
                "ON process_statuses (process_id, sort_order)"
            )
            cur.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'jobs'
                """
            )
            job_cols = {row[0] for row in cur.fetchall()}
            if "process_id" not in job_cols:
                cur.execute(
                    "ALTER TABLE jobs ADD COLUMN process_id INTEGER REFERENCES processes (process_id)"
                )
            cur.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'status_update_history'
                """
            )
            hist_cols = {row[0] for row in cur.fetchall()}
            if "process_id" not in hist_cols:
                cur.execute(
                    "ALTER TABLE status_update_history ADD COLUMN process_id INTEGER"
                )
            _seed_default_process_postgres(cur)
            _backfill_process_ids_postgres(cur)
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS processes (
          process_id   INTEGER PRIMARY KEY AUTOINCREMENT,
          name         TEXT NOT NULL UNIQUE,
          created_at   TEXT NOT NULL DEFAULT (datetime('now')),
          modified_at  TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS process_statuses (
          status_id    INTEGER PRIMARY KEY AUTOINCREMENT,
          process_id   INTEGER NOT NULL REFERENCES processes (process_id) ON DELETE CASCADE,
          status_key   TEXT NOT NULL,
          label        TEXT NOT NULL,
          sort_order   INTEGER NOT NULL DEFAULT 0,
          color        TEXT NOT NULL DEFAULT '#6366f1',
          UNIQUE (process_id, status_key),
          UNIQUE (process_id, label)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_process_statuses_process_id
        ON process_statuses (process_id, sort_order)
        """
    )

    job_cols = _sqlite_columns(conn, "jobs")
    if "process_id" not in job_cols:
        conn.execute(
            "ALTER TABLE jobs ADD COLUMN process_id INTEGER REFERENCES processes (process_id)"
        )

    hist_cols = _sqlite_columns(conn, "status_update_history")
    if "process_id" not in hist_cols:
        conn.execute("ALTER TABLE status_update_history ADD COLUMN process_id INTEGER")

    _migrate_flexible_status_sqlite(conn)
    _seed_default_process_sqlite(conn)
    _backfill_process_ids_sqlite(conn)


def _migrate_flexible_status_sqlite(conn):
    """Remove fixed status CHECK constraints so custom process statuses work."""
    if not _sqlite_table_exists(conn, "jobs"):
        return

    jobs_cols = _sqlite_columns(conn, "jobs")
    if "process_id" not in jobs_cols:
        return

    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'jobs'"
    ).fetchone()
    if row and "CHECK (status IN" not in (row[0] or ""):
        pass
    else:
        _rebuild_jobs_table_sqlite(conn)

    hist_row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'status_update_history'"
    ).fetchone()
    if hist_row and "CHECK" in (hist_row[0] or ""):
        _rebuild_history_table_sqlite(conn)


def _rebuild_jobs_table_sqlite(conn):
    cols = _sqlite_columns(conn, "jobs")
    conn.execute("ALTER TABLE jobs RENAME TO _jobs_legacy")
    conn.executescript(
        """
        CREATE TABLE jobs (
          task_id         TEXT PRIMARY KEY,
          job_id          TEXT NOT NULL,
          client_phone    TEXT NOT NULL DEFAULT '',
          description     TEXT NOT NULL DEFAULT '',
          author          TEXT NOT NULL DEFAULT 'Shop Floor',
          assignee_name   TEXT NOT NULL DEFAULT 'Alex Chen',
          assignee_photo  TEXT NOT NULL DEFAULT '',
          status          TEXT NOT NULL DEFAULT 'pre_work',
          created_at      TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
          client_email    TEXT NOT NULL DEFAULT '',
          total_requested_quantity INTEGER NOT NULL DEFAULT 1,
          good_parts_count INTEGER NOT NULL DEFAULT 0,
          scrap_parts_count INTEGER NOT NULL DEFAULT 0,
          operator_id     TEXT NOT NULL DEFAULT '',
          tracking_mode   TEXT NOT NULL DEFAULT 'unit',
          progress_percent INTEGER NOT NULL DEFAULT 0,
          operations_checklist TEXT NOT NULL DEFAULT '[]',
          process_id      INTEGER REFERENCES processes (process_id)
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
        CREATE INDEX IF NOT EXISTS idx_jobs_process_id ON jobs (process_id);
        """
    )
    legacy_cols = _sqlite_columns(conn, "_jobs_legacy")
    select_cols = [c for c in [
        "task_id", "job_id", "client_phone", "description", "author",
        "assignee_name", "assignee_photo", "status", "created_at", "updated_at",
        "client_email", "total_requested_quantity", "good_parts_count",
        "scrap_parts_count", "operator_id", "tracking_mode", "progress_percent",
        "operations_checklist", "process_id",
    ] if c in legacy_cols]
    conn.execute(
        f"""
        INSERT INTO jobs ({", ".join(select_cols)})
        SELECT {", ".join(select_cols)} FROM _jobs_legacy
        """
    )
    conn.execute("DROP TABLE _jobs_legacy")


def _rebuild_history_table_sqlite(conn):
    cols = _sqlite_columns(conn, "status_update_history")
    legacy_device = (
        "workstation_id" if "workstation_id" in cols
        else ("device_name" if "device_name" in cols else "NULL")
    )
    recorded = "recorded_at" if "recorded_at" in cols else "changed_at"
    operational = (
        "operational_start_time" if "operational_start_time" in cols else "NULL"
    )
    operator = "operator_id" if "operator_id" in cols else "NULL"
    process_col = "process_id" if "process_id" in cols else "NULL"

    conn.execute("ALTER TABLE status_update_history RENAME TO _status_history_legacy")
    conn.executescript(
        """
        CREATE TABLE status_update_history (
          task_id       TEXT NOT NULL REFERENCES jobs (task_id) ON DELETE CASCADE,
          from_status   TEXT,
          to_status     TEXT NOT NULL,
          changed_at    TEXT NOT NULL DEFAULT (datetime('now')),
          recorded_at   TEXT,
          operational_start_time TEXT,
          device_name   TEXT,
          operator_id   TEXT,
          process_id    INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_status_update_history_task_id_changed_at
          ON status_update_history (task_id, changed_at DESC);
        """
    )
    conn.execute(
        f"""
        INSERT INTO status_update_history (
          task_id, from_status, to_status, changed_at,
          recorded_at, operational_start_time, device_name, operator_id, process_id
        )
        SELECT task_id, from_status, to_status, changed_at,
               {recorded}, {operational}, {legacy_device}, {operator}, {process_col}
        FROM _status_history_legacy
        """
    )
    conn.execute("DROP TABLE _status_history_legacy")


def _seed_default_process_sqlite(conn):
    count = conn.execute("SELECT COUNT(*) AS c FROM processes").fetchone()["c"]
    if count > 0:
        return
    ts = _now("sqlite")
    conn.execute(
        "INSERT INTO processes (name, created_at) VALUES (?, ?)",
        (DEFAULT_PROCESS_NAME, ts),
    )
    process_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for index, (key, label, color) in enumerate(DEFAULT_PROCESS_STATUSES):
        conn.execute(
            """
            INSERT INTO process_statuses (process_id, status_key, label, sort_order, color)
            VALUES (?, ?, ?, ?, ?)
            """,
            (process_id, key, label, index, color),
        )


def _seed_default_process_postgres(cur):
    cur.execute("SELECT COUNT(*) FROM processes")
    if cur.fetchone()[0] > 0:
        return
    cur.execute(
        "INSERT INTO processes (name) VALUES (%s) RETURNING process_id",
        (DEFAULT_PROCESS_NAME,),
    )
    process_id = cur.fetchone()[0]
    for index, (key, label, color) in enumerate(DEFAULT_PROCESS_STATUSES):
        cur.execute(
            """
            INSERT INTO process_statuses (process_id, status_key, label, sort_order, color)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (process_id, key, label, index, color),
        )


def _backfill_process_ids_sqlite(conn):
    default_id = conn.execute(
        "SELECT process_id FROM processes ORDER BY process_id LIMIT 1"
    ).fetchone()
    if not default_id:
        return
    pid = default_id[0]
    conn.execute(
        "UPDATE jobs SET process_id = ? WHERE process_id IS NULL",
        (pid,),
    )
    conn.execute(
        """
        UPDATE status_update_history
        SET process_id = (
          SELECT process_id FROM jobs WHERE jobs.task_id = status_update_history.task_id
        )
        WHERE process_id IS NULL
        """
    )


def _backfill_process_ids_postgres(cur):
    cur.execute("SELECT process_id FROM processes ORDER BY process_id LIMIT 1")
    row = cur.fetchone()
    if not row:
        return
    pid = row[0]
    cur.execute(
        "UPDATE jobs SET process_id = %s WHERE process_id IS NULL",
        (pid,),
    )
    cur.execute(
        """
        UPDATE status_update_history h
        SET process_id = j.process_id
        FROM jobs j
        WHERE h.task_id = j.task_id AND h.process_id IS NULL
        """
    )


def _row_to_status(row):
    data = dict(row) if not isinstance(row, dict) else row
    return {
        "status_id": data["status_id"],
        "process_id": data["process_id"],
        "status_key": data["status_key"],
        "label": data["label"],
        "sort_order": int(data["sort_order"]),
        "color": data.get("color") or "#6366f1",
    }


def _fetch_statuses_for_process(conn, db_backend, process_id):
    if db_backend == "postgres":
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT status_id, process_id, status_key, label, sort_order, color
                FROM process_statuses
                WHERE process_id = %s
                ORDER BY sort_order, status_id
                """,
                (process_id,),
            )
            rows = cur.fetchall()
            return [
                _row_to_status({
                    "status_id": r[0],
                    "process_id": r[1],
                    "status_key": r[2],
                    "label": r[3],
                    "sort_order": r[4],
                    "color": r[5],
                })
                for r in rows
            ]

    rows = conn.execute(
        """
        SELECT status_id, process_id, status_key, label, sort_order, color
        FROM process_statuses
        WHERE process_id = ?
        ORDER BY sort_order, status_id
        """,
        (process_id,),
    ).fetchall()
    return [_row_to_status(row) for row in rows]


def _process_payload(conn, db_backend, row, include_statuses=True):
    data = dict(row) if not isinstance(row, dict) else row
    process_id = data["process_id"]
    payload = {
        "process_id": process_id,
        "name": data["name"],
        "created_at": data.get("created_at"),
        "modified_at": data.get("modified_at"),
    }
    if include_statuses:
        payload["statuses"] = _fetch_statuses_for_process(conn, db_backend, process_id)
    return payload


def fetch_all_processes(conn, db_backend):
    if db_backend == "postgres":
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT process_id, name, created_at, modified_at
                FROM processes
                ORDER BY name
                """
            )
            rows = cur.fetchall()
            return [
                _process_payload(conn, db_backend, {
                    "process_id": r[0],
                    "name": r[1],
                    "created_at": r[2],
                    "modified_at": r[3],
                })
                for r in rows
            ]

    rows = conn.execute(
        """
        SELECT process_id, name, created_at, modified_at
        FROM processes
        ORDER BY name
        """
    ).fetchall()
    return [_process_payload(conn, db_backend, row) for row in rows]


def fetch_process(conn, db_backend, process_id):
    if db_backend == "postgres":
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT process_id, name, created_at, modified_at
                FROM processes WHERE process_id = %s
                """,
                (process_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return _process_payload(conn, db_backend, {
                "process_id": row[0],
                "name": row[1],
                "created_at": row[2],
                "modified_at": row[3],
            })

    row = conn.execute(
        """
        SELECT process_id, name, created_at, modified_at
        FROM processes WHERE process_id = ?
        """,
        (process_id,),
    ).fetchone()
    return _process_payload(conn, db_backend, row) if row else None


def get_default_process_id(conn, db_backend):
    if db_backend == "postgres":
        with conn.cursor() as cur:
            cur.execute("SELECT process_id FROM processes ORDER BY process_id LIMIT 1")
            row = cur.fetchone()
            return row[0] if row else None

    row = conn.execute(
        "SELECT process_id FROM processes ORDER BY process_id LIMIT 1"
    ).fetchone()
    return row["process_id"] if row else None


def get_status_order(conn, db_backend, process_id):
    statuses = _fetch_statuses_for_process(conn, db_backend, process_id)
    return [entry["status_key"] for entry in statuses]


def get_status_labels(conn, db_backend, process_id):
    statuses = _fetch_statuses_for_process(conn, db_backend, process_id)
    return {entry["status_key"]: entry["label"] for entry in statuses}


def get_status_pipeline(conn, db_backend, process_id):
    return _fetch_statuses_for_process(conn, db_backend, process_id)


def validate_status_for_process(conn, db_backend, process_id, status_key):
    order = get_status_order(conn, db_backend, process_id)
    return status_key in order


def normalize_status_payload(statuses_payload):
    if not statuses_payload:
        return None, "At least one workflow step is required."
    normalized = []
    used_keys = set()
    for index, raw in enumerate(statuses_payload):
        if not isinstance(raw, dict):
            return None, "Invalid status entry."
        label = (raw.get("label") or "").strip()
        if not label:
            return None, "Each workflow step needs a label."
        status_key = (raw.get("status_key") or "").strip().lower()
        if not status_key:
            status_key = slugify_status_key(label, used_keys)
        if status_key in used_keys:
            return None, f"Duplicate step key: {status_key}"
        used_keys.add(status_key)
        color = (raw.get("color") or "").strip() or STATUS_COLOR_PALETTE[index % len(STATUS_COLOR_PALETTE)]
        status_id = raw.get("status_id")
        normalized.append({
            "status_id": int(status_id) if status_id else None,
            "status_key": status_key,
            "label": label,
            "sort_order": index,
            "color": color,
        })
    return normalized, None


def create_process(conn, db_backend, name, statuses_payload=None):
    name = (name or "").strip()
    if not name:
        return None, "Process name is required."

    if statuses_payload is None:
        statuses_payload = [
            {"label": label, "status_key": key, "color": color}
            for key, label, color in DEFAULT_PROCESS_STATUSES[:2]
        ]

    statuses, error = normalize_status_payload(statuses_payload)
    if error:
        return None, error

    ts = _now(db_backend)

    try:
        if db_backend == "postgres":
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO processes (name, created_at) VALUES (%s, %s) RETURNING process_id",
                    (name, ts),
                )
                process_id = cur.fetchone()[0]
                for entry in statuses:
                    cur.execute(
                        """
                        INSERT INTO process_statuses (
                          process_id, status_key, label, sort_order, color
                        )
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (
                            process_id,
                            entry["status_key"],
                            entry["label"],
                            entry["sort_order"],
                            entry["color"],
                        ),
                    )
        else:
            conn.execute(
                "INSERT INTO processes (name, created_at) VALUES (?, ?)",
                (name, ts),
            )
            process_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            for entry in statuses:
                conn.execute(
                    """
                    INSERT INTO process_statuses (
                      process_id, status_key, label, sort_order, color
                    )
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        process_id,
                        entry["status_key"],
                        entry["label"],
                        entry["sort_order"],
                        entry["color"],
                    ),
                )
    except Exception as exc:
        if "UNIQUE" in str(exc).upper() or "unique" in str(exc):
            return None, "A process with that name already exists."
        raise

    return fetch_process(conn, db_backend, process_id), None


def update_process(conn, db_backend, process_id, name=None, statuses_payload=None):
    existing = fetch_process(conn, db_backend, process_id)
    if not existing:
        return None, "Process not found."

    ts = _now(db_backend)

    if name is not None:
        name = name.strip()
        if not name:
            return None, "Process name cannot be empty."

    statuses = None
    if statuses_payload is not None:
        statuses, error = normalize_status_payload(statuses_payload)
        if error:
            return None, error

        with_jobs_using_removed = _statuses_in_use_by_jobs(
            conn, db_backend, process_id, statuses, existing["statuses"]
        )
        if with_jobs_using_removed:
            return None, (
                "Cannot remove steps that active jobs are currently using: "
                + ", ".join(with_jobs_using_removed)
            )

    try:
        if db_backend == "postgres":
            with conn.cursor() as cur:
                if name is not None:
                    cur.execute(
                        "UPDATE processes SET name = %s, modified_at = %s WHERE process_id = %s",
                        (name, ts, process_id),
                    )
                if statuses is not None:
                    _replace_process_statuses_postgres(cur, process_id, statuses)
        else:
            if name is not None:
                conn.execute(
                    "UPDATE processes SET name = ?, modified_at = ? WHERE process_id = ?",
                    (name, ts, process_id),
                )
            if statuses is not None:
                _replace_process_statuses_sqlite(conn, process_id, statuses)
    except Exception as exc:
        if "UNIQUE" in str(exc).upper() or "unique" in str(exc):
            return None, "A process with that name or duplicate step already exists."
        raise

    return fetch_process(conn, db_backend, process_id), None


def _statuses_in_use_by_jobs(conn, db_backend, process_id, new_statuses, old_statuses):
    new_keys = {entry["status_key"] for entry in new_statuses}
    removed = [entry["status_key"] for entry in old_statuses if entry["status_key"] not in new_keys]
    if not removed:
        return []

    in_use = []
    for key in removed:
        if db_backend == "postgres":
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM jobs WHERE process_id = %s AND status = %s",
                    (process_id, key),
                )
                count = cur.fetchone()[0]
        else:
            count = conn.execute(
                "SELECT COUNT(*) AS c FROM jobs WHERE process_id = ? AND status = ?",
                (process_id, key),
            ).fetchone()["c"]
        if count > 0:
            in_use.append(key)
    return in_use


def _replace_process_statuses_sqlite(conn, process_id, statuses):
    conn.execute("DELETE FROM process_statuses WHERE process_id = ?", (process_id,))
    for entry in statuses:
        conn.execute(
            """
            INSERT INTO process_statuses (
              process_id, status_key, label, sort_order, color
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                process_id,
                entry["status_key"],
                entry["label"],
                entry["sort_order"],
                entry["color"],
            ),
        )


def _replace_process_statuses_postgres(cur, process_id, statuses):
    cur.execute("DELETE FROM process_statuses WHERE process_id = %s", (process_id,))
    for entry in statuses:
        cur.execute(
            """
            INSERT INTO process_statuses (
              process_id, status_key, label, sort_order, color
            )
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                process_id,
                entry["status_key"],
                entry["label"],
                entry["sort_order"],
                entry["color"],
            ),
        )


def delete_process(conn, db_backend, process_id):
    if db_backend == "postgres":
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM processes")
            if cur.fetchone()[0] <= 1:
                return False, "At least one process must remain."
            cur.execute(
                "SELECT COUNT(*) FROM jobs WHERE process_id = %s",
                (process_id,),
            )
            if cur.fetchone()[0] > 0:
                return False, "Cannot delete a process that still has jobs."
            cur.execute("DELETE FROM processes WHERE process_id = %s", (process_id,))
            return cur.rowcount > 0, None

    total = conn.execute("SELECT COUNT(*) AS c FROM processes").fetchone()["c"]
    if total <= 1:
        return False, "At least one process must remain."
    job_count = conn.execute(
        "SELECT COUNT(*) AS c FROM jobs WHERE process_id = ?",
        (process_id,),
    ).fetchone()["c"]
    if job_count > 0:
        return False, "Cannot delete a process that still has jobs."
    conn.execute("DELETE FROM processes WHERE process_id = ?", (process_id,))
    return True, None


def fetch_all_floor_statuses(conn, db_backend):
    """Union of all process statuses for floor scan station picker."""
    processes = fetch_all_processes(conn, db_backend)
    seen = set()
    merged = []
    for process in processes:
        for status in process["statuses"]:
            if status["status_key"] in seen:
                continue
            seen.add(status["status_key"])
            merged.append({
                "status_key": status["status_key"],
                "label": status["label"],
                "color": status["color"],
                "process_name": process["name"],
            })
    return merged
