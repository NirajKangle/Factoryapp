# MyFactory → n8n automation

This guide covers the status-change webhook, the floor QR scanner, and your first n8n workflow.

## What was built

| Piece | Purpose |
|-------|---------|
| `webhooks.py` | Background HTTP POST when a task **status** changes |
| `set_job_status()` in `app.py` | Triggers the webhook after DB commit (drag Kanban, scan, API move) |
| `POST /api/floor/scan` | Mobile scan endpoint (no login) |
| `GET /scan?station=…` | Full-screen camera QR scanner for the shop floor |

### Webhook payload (JSON)

Sent to every URL in `WEBHOOK_URL` (comma-separated for multiple targets):

```json
{
  "event": "task.status_changed",
  "task_id": "We47cSkC",
  "from_status": "machining",
  "from_status_label": "Machining",
  "to_status": "qc",
  "to_status_label": "QC",
  "customer_phone": "+9762306281",
  "job": {
    "task_id": "We47cSkC",
    "job_id": "BMIDC",
    "client_phone": "+9762306281",
    "description": "",
    "author": "Shop Floor",
    "assignee_name": "Alex Chen",
    "assignee_photo": "https://...",
    "status": "qc",
    "status_label": "QC",
    "created_at": "...",
    "updated_at": "..."
  },
  "changed_at": "2026-06-03T22:00:00+00:00"
}
```

Optional header: `X-Webhook-Secret` if you set `WEBHOOK_SECRET` in the environment.

---

## Step A — Enable the webhook

1. Start n8n (see Step C below) and create a **Webhook** node. Set method to **POST**, path e.g. `myfactory-status`.
2. Click **Listen for test event** and copy the **Production URL** (local example: `http://localhost:5678/webhook/myfactory-status`).
3. In PowerShell, before starting Flask:

```powershell
cd C:\Users\welln\Factoryapp
$env:WEBHOOK_URL = "http://localhost:5678/webhook/myfactory-status"
python app.py
```

4. Drag a task to another column in the Kanban UI. Flask returns immediately; n8n receives the POST in a **background thread** (no UI lag).

Check Flask logs for `Webhook delivered` or `Webhook failed` messages.

---

## Step B — Floor scan page on your phone

### 1. Start Flask on your network

`app.py` already uses `host="0.0.0.0"` so other devices on Wi‑Fi can reach it.

```powershell
python app.py
```

### 2. Find your PC’s IP

```powershell
ipconfig
```

Look for **IPv4 Address** on Wi‑Fi (e.g. `192.168.1.42`).

### 3. Open the scan URL on the phone

Use one station per tablet/phone at that bench:

| Station | URL |
|---------|-----|
| Pre-Work | `http://192.168.1.42:5000/scan?station=pre_work` |
| Machining | `http://192.168.1.42:5000/scan?station=machining` |
| QC | `http://192.168.1.42:5000/scan?station=qc` |
| Dispatch | `http://192.168.1.42:5000/scan?station=dispatch` |

Replace `192.168.1.42` with your PC IP. Phone and PC must be on the **same Wi‑Fi**.

### 4. Allow the camera

- Tap **Allow** when the browser asks for camera access.
- **iPhone Safari** often requires **HTTPS** for the camera. Options:
  - Use **ngrok**: `ngrok http 5000` → open `https://xxxx.ngrok.io/scan?station=qc`
  - Or use **Android Chrome** on the same LAN (usually works with HTTP).
- Scan a QR that contains either:
  - The 8-character **task_id** (e.g. `We47cSkC`), or
  - JSON: `{"task_id":"We47cSkC"}`

### 5. Task QR codes (in the app)

Each job shows a **small QR** on Kanban cards and in the table. Open **Task view** for a larger code and **Print label**.

The QR encodes `{"task_id":"…","job_id":"…"}` — the floor scanner reads this automatically.

---

## Step C — First n8n workflow

### Install and run n8n locally

```powershell
npx n8n
```

Open **http://localhost:5678** and create an account (local only).

### Build the workflow

1. **Webhook** node  
   - HTTP Method: `POST`  
   - Path: `myfactory-status`  
   - Response: “Immediately” / 200 OK  

2. **Set** node (optional, for WhatsApp/email templates)  
   - Map fields from `$json.body` or `$json` (depends on n8n version):  
     - Phone: `{{ $json.customer_phone }}`  
     - Job name: `{{ $json.job.job_id }}`  
     - Status: `{{ $json.to_status_label }}`  

3. **Send Email** or **HTTP Request** (WhatsApp Business API) node  
   - Use `customer_phone` and status labels from the payload above.  
   - WhatsApp Cloud API needs approved templates and Meta credentials (configure in n8n credentials).

4. **Activate** the workflow (toggle ON).

5. Set Flask’s webhook URL to the webhook node’s URL (see Step A).

### Test end-to-end

1. n8n workflow **Active**, Webhook listening.  
2. Flask running with `WEBHOOK_URL` set.  
3. Drag a card in MyFactory → n8n execution appears → email/WhatsApp step runs.  
4. Scan a QR on `/scan?station=…` → status updates **and** the same webhook fires.

### Troubleshooting

| Issue | Fix |
|-------|-----|
| n8n never receives POST | Check `WEBHOOK_URL`, workflow **Active**, correct webhook URL |
| Webhook works from scan but not drag | Both use `set_job_status`; restart Flask after setting env |
| Phone camera blank | HTTPS (ngrok) or Android Chrome; allow camera permission |
| `Could not update task` on scan | QR must match a real `task_id`; station query param must be valid |

---

## Environment variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `WEBHOOK_URL` | `http://localhost:5678/webhook/myfactory-status` | n8n (or Zapier) ingest URL(s), comma-separated |
| `WEBHOOK_SECRET` | `my-secret` | Sent as `X-Webhook-Secret` header |
| `WEBHOOK_TIMEOUT_SEC` | `5` | Max seconds per outbound request |

---

## Verify what’s in the repo

```powershell
# Webhook module
type webhooks.py

# Status change + webhook hook
Select-String -Path app.py -Pattern "dispatch_status_change"

# Scan routes
Select-String -Path app.py -Pattern "floor_scan|floor_scan_page"

# Mobile page
type templates\floor-scan.html
```
