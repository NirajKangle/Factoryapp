"""Fire-and-forget outbound webhooks for automation (e.g. n8n)."""

from __future__ import annotations

import json
import logging
import os
import threading
import urllib.error
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)

WEBHOOK_TIMEOUT_SEC = float(os.environ.get("WEBHOOK_TIMEOUT_SEC", "5"))
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "").strip()


def webhook_urls() -> list[str]:
    raw = os.environ.get("WEBHOOK_URL", "").strip()
    if not raw:
        return []
    return [url.strip() for url in raw.split(",") if url.strip()]


def build_status_change_payload(
    *,
    batch_id: str,
    device_name: str | None,
    operator_id: str | None,
    from_status: str | None,
    to_status: str,
    job: dict[str, Any],
    status_labels: dict[str, str],
) -> dict[str, Any]:
    return {
        "event": "task.status_changed",
        "batch_id": batch_id,
        "device_name": device_name,
        "operator_id": operator_id,
        "old_status": from_status,
        "new_status": to_status,
        "customer_phone": job.get("client_phone"),
        "customer_email": job.get("client_email") or "",
    }


def _post_json(url: str, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, default=str).encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": "Werqr/1.0"}
    if WEBHOOK_SECRET:
        headers["X-Webhook-Secret"] = WEBHOOK_SECRET

    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=WEBHOOK_TIMEOUT_SEC) as response:
            logger.info(
                "Webhook delivered to %s (HTTP %s)", url, response.status
            )
    except urllib.error.HTTPError as exc:
        logger.warning(
            "Webhook HTTP error for %s: %s %s", url, exc.code, exc.reason
        )
    except Exception as exc:
        logger.warning("Webhook failed for %s: %s", url, exc)


def _deliver(payload: dict[str, Any]) -> None:
    urls = webhook_urls()
    if not urls:
        return
    for url in urls:
        _post_json(url, payload)


def dispatch_status_change_async(
    *,
    batch_id: str,
    from_status: str | None,
    to_status: str,
    job: dict[str, Any],
    status_labels: dict[str, str],
    device_name: str | None = None,
    operator_id: str | None = None,
) -> None:
    """Queue webhook POST on a background thread so the API/UI never waits on n8n."""
    if not webhook_urls():
        return

    payload = build_status_change_payload(
        batch_id=batch_id,
        device_name=device_name,
        operator_id=operator_id,
        from_status=from_status,
        to_status=to_status,
        job=job,
        status_labels=status_labels,
    )
    thread = threading.Thread(
        target=_deliver,
        args=(payload,),
        name=f"webhook-{batch_id}",
        daemon=True,
    )
    thread.start()
