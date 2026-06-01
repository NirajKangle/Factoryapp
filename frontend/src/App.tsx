import { useCallback, useEffect, useState } from "react";
import { Factory, RefreshCw } from "lucide-react";

import KanbanBoard from "@/components/ui/kanban-board";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { PIPELINE, type Job, type JobStatus } from "@/lib/job-status";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1565793298595-6a879b1d9492?auto=format&fit=crop&w=1400&q=80";

async function fetchJobs(): Promise<Job[]> {
  const response = await fetch("/api/jobs");
  if (!response.ok) {
    throw new Error("Failed to load jobs");
  }
  return response.json();
}

function statusLabelFor(status: JobStatus): string {
  return PIPELINE.find((stage) => stage.key === status)?.label ?? status;
}

function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadJobs = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchJobs();
      setJobs(data);
    } catch {
      setError("Could not reach the Flask API. Start the backend with python app.py.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  async function handleAddJob(event: React.FormEvent) {
    event.preventDefault();
    if (!jobId.trim() || !clientPhone.trim()) return;

    setSubmitting(true);
    const body = new FormData();
    body.append("job_id", jobId.trim());
    body.append("client_phone", clientPhone.trim());

    await fetch("/jobs", { method: "POST", body });
    setJobId("");
    setClientPhone("");
    setSubmitting(false);
    await loadJobs();
  }

  async function moveJob(jobIdToMove: string, targetStatus: JobStatus) {
    const job = jobs.find((entry) => entry.job_id === jobIdToMove);
    if (!job || job.status === targetStatus) return;

    setError(null);
    const previousJobs = jobs;
    setJobs((current) =>
      current.map((entry) =>
        entry.job_id === jobIdToMove
          ? {
              ...entry,
              status: targetStatus,
              status_label: statusLabelFor(targetStatus),
            }
          : entry
      )
    );

    const response = await fetch(
      `/jobs/${encodeURIComponent(jobIdToMove)}/move`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ status: targetStatus }),
      }
    );

    if (!response.ok) {
      setJobs(previousJobs);
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(
        payload?.error ??
          "Could not move job. Restart Flask if you recently updated the app."
      );
      return;
    }

    await loadJobs();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div
          className="relative h-36 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/40" />
          <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/20 p-2 text-primary">
                <Factory className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">MIDC Machine Shop</h1>
                <p className="text-sm text-muted-foreground">Job status tracker</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Status status="online">
                <StatusIndicator />
                <StatusLabel>Live</StatusLabel>
              </Status>
              <span className="text-sm text-muted-foreground">
                {jobs.length} active job{jobs.length === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={() => void loadJobs()}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-6">
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
            {error}
          </div>
        )}

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            New Job
          </h2>
          <form onSubmit={handleAddJob} className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs text-muted-foreground">
              Job ID
              <input
                type="text"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                placeholder="MIDC-2026-0142"
                required
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs text-muted-foreground">
              Client Phone
              <input
                type="text"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="+15551234567"
                required
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              Add Job
            </button>
          </form>
        </section>

        <KanbanBoard jobs={jobs} loading={loading} onMoveJob={moveJob} />
      </main>
    </div>
  );
}

export default App;
