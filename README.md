# MyFactory

Shop-floor job tracker (Flask + React) with Kanban, table view, mobile QR scanning, and n8n webhooks.

## Quick start

```powershell
cd C:\Users\welln\Factoryapp
python app.py
```

Open **http://127.0.0.1:5000** (build the UI first with `cd frontend && npm run build` if needed).

## Automation & floor scan

See **[N8N_SETUP.md](N8N_SETUP.md)** for:

- Status-change webhooks (Step A)
- Mobile scan page `/scan?station=…` (Step B)
- First n8n workflow (Step C)

Copy `.env.example` and set `WEBHOOK_URL` before starting Flask when using n8n.
