"""MES rules: workstation auth, batch fields, dual timestamps, webhook payload."""

import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

# Isolate test DB before app import side effects
_test_dir = tempfile.mkdtemp()
_test_db = Path(_test_dir) / "test_mes.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db}"
os.environ["AUTO_START_N8N"] = "false"
os.environ.pop("WEBHOOK_URL", None)

import app as factory_app  # noqa: E402
from webhooks import build_status_change_payload  # noqa: E402


class MesArchitectureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        factory_app.configure_database()
        factory_app.ensure_schema()

    def setUp(self):
        with factory_app.get_db() as conn:
            conn.execute("DELETE FROM status_update_history")
            conn.execute("DELETE FROM jobs")
            conn.execute("DELETE FROM devices")

    def test_device_register_and_validate(self):
        client = factory_app.app.test_client()
        res = client.post(
            "/api/devices/register",
            json={"device_id": "Milling-01"},
        )
        self.assertEqual(res.status_code, 201)
        body = res.get_json()
        self.assertEqual(body["device_id"], "Milling-01")
        self.assertTrue(body["device_token"])

        token = body["device_token"]
        me = client.get("/api/devices/me", headers={"X-Device-Token": token})
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.get_json()["device_id"], "Milling-01")

    def test_scan_requires_device_token(self):
        client = factory_app.app.test_client()
        task_id = factory_app.create_job("BATCH-1", "+15551234567", total_requested_quantity=50)
        res = client.post(
            "/api/floor/scan",
            json={"raw": task_id, "station": "machining"},
        )
        self.assertEqual(res.status_code, 401)

    def test_scan_with_token_logs_dual_timestamps(self):
        client = factory_app.app.test_client()
        reg = client.post(
            "/api/devices/register",
            json={"device_id": "Assembly-04"},
        )
        token = reg.get_json()["device_token"]
        task_id = factory_app.create_job("BATCH-2", "+15559876543", total_requested_quantity=100)

        res = client.post(
            "/api/floor/scan",
            json={
                "raw": task_id,
                "station": "machining",
                "operator_id": "BADGE-991",
                "operational_start": "30m_ago",
            },
            headers={"X-Device-Token": token},
        )
        self.assertEqual(res.status_code, 200)

        with factory_app.get_db() as conn:
            hist = conn.execute(
                """
                SELECT device_name, operator_id, recorded_at, operational_start_time
                FROM status_update_history
                WHERE task_id = ?
                ORDER BY recorded_at DESC LIMIT 1
                """,
                (task_id,),
            ).fetchone()

        self.assertEqual(hist["device_name"], "Assembly-04")
        self.assertEqual(hist["operator_id"], "BADGE-991")
        recorded = factory_app.as_datetime(hist["recorded_at"])
        operational = factory_app.as_datetime(hist["operational_start_time"])
        self.assertLess((recorded - operational).total_seconds(), 31 * 60)
        self.assertGreater((recorded - operational).total_seconds(), 29 * 60)

    def test_scan_defaults_operator_to_device_name(self):
        client = factory_app.app.test_client()
        reg = client.post(
            "/api/devices/register",
            json={"device_id": "Raj-Phone"},
        )
        token = reg.get_json()["device_token"]
        task_id = factory_app.create_job("BATCH-3", "+15550001111")

        res = client.post(
            "/api/floor/scan",
            json={"raw": task_id, "station": "machining"},
            headers={"X-Device-Token": token},
        )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertEqual(body["from_status"], "pre_work")
        self.assertEqual(body["to_status"], "machining")
        self.assertEqual(body["operator_id"], "Raj-Phone")

        with factory_app.get_db() as conn:
            hist = conn.execute(
                """
                SELECT operator_id FROM status_update_history
                WHERE task_id = ? ORDER BY recorded_at DESC LIMIT 1
                """,
                (task_id,),
            ).fetchone()
        self.assertEqual(hist["operator_id"], "Raj-Phone")

    def test_register_returns_same_token_for_existing_workstation(self):
        client = factory_app.app.test_client()
        first = client.post(
            "/api/devices/register",
            json={"device_id": "Floor-Phone"},
        )
        second = client.post(
            "/api/devices/register",
            json={"device_id": "Floor-Phone"},
        )
        self.assertEqual(first.status_code, 201)
        self.assertIn(second.status_code, (200, 201))
        self.assertEqual(
            first.get_json()["device_token"],
            second.get_json()["device_token"],
        )

    def test_webhook_payload_shape(self):
        job = {
            "task_id": "abc12345",
            "job_id": "WO-100",
            "client_phone": "+91",
            "client_email": "a@b.com",
        }
        payload = build_status_change_payload(
            batch_id="abc12345",
            device_name="Milling-01",
            operator_id="BADGE-1",
            from_status="pre_work",
            to_status="machining",
            job=job,
            status_labels=factory_app.STATUS_LABELS,
        )
        self.assertEqual(payload["event"], "task.status_changed")
        self.assertEqual(payload["batch_id"], "abc12345")
        self.assertEqual(payload["device_name"], "Milling-01")
        self.assertEqual(payload["operator_id"], "BADGE-1")
        self.assertEqual(payload["old_status"], "pre_work")
        self.assertEqual(payload["new_status"], "machining")
        self.assertEqual(payload["customer_phone"], "+91")
        self.assertEqual(payload["customer_email"], "a@b.com")


if __name__ == "__main__":
    unittest.main()
