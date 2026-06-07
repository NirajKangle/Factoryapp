import { useCallback, useEffect, useMemo, useState } from "react";
import KanbanBoard from "@/components/ui/kanban-board";
import JobsTable from "@/components/ui/jobs-table";
import TaskSidebar, { type TaskFormData } from "@/components/ui/task-sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Factory } from "lucide-react";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import {
  DEFAULT_ASSIGNEE,
  findTeamMember,
  PIPELINE,
  TEAM_MEMBERS,
  type Job,
  type JobStatus,
} from "@/lib/job-status";
import { DeviceMenu } from "@/components/ui/device-menu";
import { StationSetup } from "@/components/ui/station-setup";
import {
  getDeviceToken,
  getWorkstationId,
  isMobileBrowser,
  stationHeaders,
} from "@/lib/station";
import { cn } from "@/lib/utils";

type ViewMode = "kanban" | "table";

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
  const [view, setView] = useState<ViewMode>("kanban");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [deletingTask, setDeletingTask] = useState(false);
  const [newAssignee, setNewAssignee] = useState(DEFAULT_ASSIGNEE.name);
  const [jobId, setJobId] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [workstationId, setWorkstationId] = useState<string | null>(() =>
    getWorkstationId()
  );

  const selectedJob = useMemo(
    () => jobs.find((job) => job.task_id === selectedTaskId) ?? null,
    [jobs, selectedTaskId]
  );

  const loadJobs = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchJobs();
      setJobs(data);
      setSelectedTaskId((current) =>
        current && data.some((job) => job.task_id === current) ? current : null
      );
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
    body.append("description", description.trim());
    const member = findTeamMember(newAssignee) ?? DEFAULT_ASSIGNEE;
    body.append("assignee_name", member.name);
    body.append("assignee_photo", member.photo);

    await fetch("/jobs", { method: "POST", body });
    setJobId("");
    setClientPhone("");
    setDescription("");
    setSubmitting(false);
    await loadJobs();
  }

  async function saveTask(taskId: string, data: TaskFormData) {
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Could not save task.");
      }

      const updated = (await response.json()) as Job;
      setJobs((current) =>
        current.map((entry) => (entry.task_id === taskId ? updated : entry))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save task.");
      throw err;
    }
  }

  async function deleteTask(taskId: string) {
    setDeletingTask(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(taskId)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Could not delete task.");
      }

      setJobs((current) => current.filter((entry) => entry.task_id !== taskId));
      setSelectedTaskId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete task.");
      throw err;
    } finally {
      setDeletingTask(false);
    }
  }

  async function moveJob(taskId: string, targetStatus: JobStatus) {
    const job = jobs.find((entry) => entry.task_id === taskId);
    if (!job || job.status === targetStatus) return;

    if (!getDeviceToken()) {
      setError(
        isMobileBrowser()
          ? "Open the floor scan page to move jobs from your phone."
          : "Register this PC above before dragging jobs on the board."
      );
      return;
    }

    setError(null);
    const previousJobs = jobs;
    setJobs((current) =>
      current.map((entry) =>
        entry.task_id === taskId
          ? {
              ...entry,
              status: targetStatus,
              status_label: statusLabelFor(targetStatus),
            }
          : entry
      )
    );

    const response = await fetch(`/jobs/${encodeURIComponent(taskId)}/move`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...stationHeaders(),
      },
      body: JSON.stringify({ status: targetStatus }),
    });

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

  function openTask(job: Job) {
    setSelectedTaskId(job.task_id);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <Factory className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Werqr
              </h1>
              <p className="text-sm text-muted-foreground">Shop floor job tracker</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Status status="online">
              <StatusIndicator />
              <StatusLabel>Live</StatusLabel>
            </Status>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {jobs.length} job{jobs.length === 1 ? "" : "s"}
            </span>
            {workstationId && (
              <DeviceMenu
                currentDeviceId={workstationId}
                onSwitch={(id) => setWorkstationId(id)}
              />
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 p-6">
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!workstationId && !isMobileBrowser() && (
          <StationSetup onReady={(id) => setWorkstationId(id)} />
        )}

        <section className="rounded-xl border border-border bg-section-new-job p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Add a new Job</h2>
          <form onSubmit={handleAddJob} className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[160px] flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Job Name</span>
              <input
                type="text"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                placeholder="Add job name"
                required
                className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/45"
              />
            </label>
            <label className="flex min-w-[160px] flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Customer Phone</span>
              <input
                type="text"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="Add customer phone"
                required
                className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/45"
              />
            </label>
            <label className="flex min-w-[140px] flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Assignee</span>
              <select
                value={newAssignee}
                onChange={(e) => setNewAssignee(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground"
              >
                {TEAM_MEMBERS.map((member) => (
                  <option key={member.name} value={member.name}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[200px] flex-[2] flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Description</span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add notes or job details"
                className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/45"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              Add Job
            </button>
          </form>
        </section>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView("kanban")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              view === "kanban"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            Kanban
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              view === "table"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            Table view
          </button>
        </div>

        {view === "kanban" ? (
          <KanbanBoard
            jobs={jobs}
            loading={loading}
            selectedTaskId={selectedTaskId}
            onMoveJob={moveJob}
            onSelectTask={openTask}
          />
        ) : (
          <JobsTable
            jobs={jobs}
            loading={loading}
            selectedTaskId={selectedTaskId}
            onSelectTask={openTask}
          />
        )}
      </main>

      <TaskSidebar
        job={selectedJob}
        open={selectedJob !== null}
        onClose={() => setSelectedTaskId(null)}
        onSave={saveTask}
        onDelete={deleteTask}
        deleting={deletingTask}
      />
    </div>
  );
}

export default App;
