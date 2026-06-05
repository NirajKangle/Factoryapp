"""Local dev bootstrap: .env loading and optional n8n auto-start."""

from __future__ import annotations

import logging
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
N8N_HOST = "127.0.0.1"
N8N_PORT = 5678
N8N_STARTUP_TIMEOUT_SEC = 90


def load_dotenv_file() -> None:
    env_path = BASE_DIR / ".env"
    try:
        from dotenv import load_dotenv

        if env_path.exists():
            load_dotenv(env_path)
            logger.info("Loaded environment from %s", env_path)
        else:
            logger.info("No .env file at %s (using system environment only)", env_path)
    except ImportError:
        if env_path.exists():
            logger.warning(
                "python-dotenv is not installed; .env will not be loaded. "
                "Run: pip install python-dotenv"
            )


def _port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _auto_start_enabled() -> bool:
    return os.environ.get("AUTO_START_N8N", "true").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def ensure_n8n_running() -> None:
    """Start local n8n via npx if AUTO_START_N8N is enabled and port 5678 is free."""
    if not _auto_start_enabled():
        logger.info("AUTO_START_N8N is disabled — skipping n8n startup")
        return

    if _port_open(N8N_HOST, N8N_PORT):
        logger.info("n8n already running at http://localhost:%s", N8N_PORT)
        return

    logger.info("Starting local n8n (first launch may take a minute)...")
    popen_kwargs: dict = {
        "cwd": BASE_DIR,
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if sys.platform == "win32":
        popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

    try:
        if sys.platform == "win32":
            subprocess.Popen(["npx.cmd", "n8n"], **popen_kwargs)
        else:
            subprocess.Popen(["npx", "n8n"], **popen_kwargs)
    except FileNotFoundError:
        logger.error(
            "Could not start n8n: npx not found. Install Node.js or run n8n manually."
        )
        return
    except Exception as exc:
        logger.error("Failed to start n8n: %s", exc)
        return

    deadline = time.time() + N8N_STARTUP_TIMEOUT_SEC
    while time.time() < deadline:
        if _port_open(N8N_HOST, N8N_PORT):
            logger.info("n8n is ready at http://localhost:%s", N8N_PORT)
            return
        time.sleep(2)

    logger.warning(
        "n8n did not open port %s within %ss — it may still be installing. "
        "Open http://localhost:%s manually and keep your workflow Active.",
        N8N_PORT,
        N8N_STARTUP_TIMEOUT_SEC,
        N8N_PORT,
    )
