"""Station + device-token authorization for shop-floor terminals."""

from __future__ import annotations

import secrets
from typing import Any

DEVICE_TOKEN_BYTES = 32


def generate_device_token() -> str:
    return secrets.token_urlsafe(DEVICE_TOKEN_BYTES)


DEVICE_TOKEN_COOKIE = "mfac_device_token"


def extract_device_token(
    headers,
    payload: dict[str, Any] | None = None,
    cookies: dict[str, Any] | None = None,
) -> str | None:
    payload = payload or {}
    header_token = (headers.get("X-Device-Token") or headers.get("x-device-token") or "").strip()
    if header_token:
        return header_token
    if cookies:
        cookie_token = (cookies.get(DEVICE_TOKEN_COOKIE) or "").strip()
        if cookie_token:
            return cookie_token
    body_token = (payload.get("device_token") or "").strip()
    return body_token or None
