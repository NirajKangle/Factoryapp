import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, LayoutGrid, Table2 } from "lucide-react";

import type { AppMenuAction } from "@/components/ui/app-menu";
import DashboardPanel from "@/components/ui/dashboard-panel";
import KanbanBoard from "@/components/ui/kanban-board";
import JobsTable from "@/components/ui/jobs-table";
import { ProcessSelector } from "@/components/ui/process-selector";
import { ProcessesPanel } from "@/components/ui/processes-panel";
import TaskSidebar, { type TaskFormData } from "@/components/ui/task-sidebar";
import { TeamMembersPanel } from "@/components/ui/team-members-panel";
import { WerqrHeader } from "@/components/ui/werqr-header";
import {
  findTeamMember,
  PIPELINE,
  TEAM_MEMBERS,
  type Job,
  type JobStatus,
  type ProcessStage,
} from "@/lib/job-status";
import { fetchProcesses, type ProcessRecord } from "@/lib/processes";
import { StationSetup } from "@/components/ui/station-setup";
import {
  fetchTeamMembers,
  type TeamMemberRecord,
} from "@/lib/team-members";
import {
  getDeviceToken,
  getWorkstationId,
  isMobileBrowser,
  restoreDeviceSession,
  stationHeaders,
} from "@/lib/station";
import type { DashboardTab } from "@/lib/dashboard-analytics";
import { cn } from "@/lib/utils";

type ViewMode = "kanban" | "table" | "dashboard";

async function fetchJobs(processId?: number): Promise<Job[]> {
  const query = processId ? `?process_id=${processId}` : "";
  const response = await fetch(`/api/jobs${query}`);
  if (!response.ok) {
    throw new Error("Failed to load jobs");
  }
  return response.json();
}

function statusLabelFor(status: JobStatus, pipeline: ProcessStage[]): string {
  return pipeline.find((stage) => stage.status_key === status)?.label ?? status;
}

function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("kanban");
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>("overview");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [deletingTask, setDeletingTask] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRecord[]>([]);
  const [teamPanelOpen, setTeamPanelOpen] = useState(false);
  const [processes, setProcesses] = useState<ProcessRecord[]>([]);
  const [processPanelOpen, setProcessPanelOpen] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [newAssignee, setNewAssignee] = useState("");
  const [jobId, setJobId] = useState("");
  const [newJobProcessId, setNewJobProcessId] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [workstationId, setWorkstationId] = useState<string | null>(() =>
    getWorkstationId()
  );
  const [deviceReady, setDeviceReady] = useState(() => Boolean(getWorkstationId()));

  const assigneeOptions = teamMembers.length > 0 ? teamMembers : TEAM_MEMBERS;

  const selectedProcess = useMemo(
    () => processes.find((entry) => entry.process_id === selectedProcessId) ?? null,
    [processes, selectedProcessId]
  );

  const activePipeline = useMemo<ProcessStage[]>(
    () =>
      selectedProcess?.statuses ??
      PIPELINE.map((stage, index) => ({
        status_key: stage.key,
        label: stage.label,
        sort_order: index,
        color: stage.color,
      })),
    [selectedProcess]
  );

  const selectedJob = useMemo(
    () => jobs.find((job) => job.task_id === selectedTaskId) ?? null,
    [jobs, selectedTaskId]
  );

  const loadTeamMembers = useCallback(async () => {
    try {
      const members = await fetchTeamMembers();
      setTeamMembers(members);
      setNewAssignee((current) =>
        current && members.some((member) => member.name === current) ? current : ""
      );
    } catch {
      setTeamMembers([]);
    }
  }, []);

  const loadProcesses = useCallback(async () => {
    try {
      const data = await fetchProcesses();
      setProcesses(data);
      setSelectedProcessId((current) => {
        if (current && data.some((entry) => entry.process_id === current)) {
          return current;
        }
        return data[0]?.process_id ?? null;
      });
      setNewJobProcessId((current) => {
        if (current && data.some((entry) => String(entry.process_id) === current)) {
          return current;
        }
        return data[0] ? String(data[0].process_id) : "";
      });
    } catch {
      setProcesses([]);
    }
  }, []);

  const loadJobs = useCallback(async (processId?: number | null) => {
    setError(null);
    try {
      const data = await fetchJobs(processId ?? undefined);
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
    if (isMobileBrowser()) {
      setDeviceReady(true);
      return;
    }

    void restoreDeviceSession().then((deviceId) => {
      if (deviceId) {
        setWorkstationId(deviceId);
      }
      setDeviceReady(true);
    });
  }, []);

  useEffect(() => {
    void loadProcesses();
    void loadTeamMembers();
  }, [loadProcesses, loadTeamMembers]);

  useEffect(() => {
    if (selectedProcessId === null) return;
    setNewJobProcessId(String(selectedProcessId));
    setLoading(true);
    void loadJobs(selectedProcessId);
  }, [selectedProcessId, loadJobs]);

  async function handleAddJob(event: React.FormEvent) {
    event.preventDefault();
    if (!jobId.trim() || !newJobProcessId) return;

    setSubmitting(true);
    const body = new FormData();
    body.append("job_id", jobId.trim());
    body.append("process_id", newJobProcessId);
    body.append("description", description.trim());
    const member = newAssignee
      ? findTeamMember(assigneeOptions, newAssignee)
      : undefined;
    if (member) {
      body.append("assignee_name", member.name);
      body.append("assignee_photo", member.photo);
    }

    await fetch("/jobs", { method: "POST", body });
    setJobId("");
    setDescription("");
    setNewAssignee("");
    setSubmitting(false);
    await loadJobs(selectedProcessId);
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
              status_label: statusLabelFor(targetStatus, activePipeline),
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

    await loadJobs(selectedProcessId);
  }

  function openTask(job: Job) {
    setSelectedTaskId(job.task_id);
  }

  function handleMenuAction(action: AppMenuAction) {
    if (action === "team-members") {
      setTeamPanelOpen(true);
      return;
    }
    if (action === "processes") {
      setProcessPanelOpen(true);
      return;
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <WerqrHeader
        jobCount={jobs.length}
        workstationId={workstationId}
        onMenuAction={handleMenuAction}
      />

      <main className="mx-auto max-w-6xl space-y-5 p-6">
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!workstationId && !isMobileBrowser() && deviceReady && (
          <StationSetup onReady={(id) => setWorkstationId(id)} />
        )}

        <section className="rounded-xl border border-border bg-section-new-job px-4 py-3 shadow-sm">
          <h2 className="mb-3 pl-3 text-lg font-semibold text-foreground">Add a new Job</h2>
          <form onSubmit={handleAddJob} className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[140px] flex-1 flex-col gap-1">
              <span className="pl-3 text-xs font-medium text-muted-foreground">Job Name</span>
              <input
                type="text"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                placeholder="Add job name"
                required
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/45"
              />
            </label>
            <label className="flex min-w-[140px] flex-1 flex-col gap-1">
              <span className="pl-3 text-xs font-medium text-muted-foreground">Process</span>
              <select
                value={newJobProcessId}
                onChange={(e) => setNewJobProcessId(e.target.value)}
                required
                className="h-10 rounded-lg border border-input bg-background pl-3 pr-10 text-sm text-foreground"
              >
                <option value="">Select process</option>
                {processes.map((process) => (
                  <option key={process.process_id} value={process.process_id}>
                    {process.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[120px] flex-1 flex-col gap-1">
              <span className="pl-3 text-xs font-medium text-muted-foreground">Assignee</span>
              <select
                value={newAssignee}
                onChange={(e) => setNewAssignee(e.target.value)}
                className="h-10 rounded-lg border border-input bg-background pl-3 pr-10 text-sm text-foreground"
              >
                <option value="">Select assignee</option>
                {assigneeOptions.map((member) => (
                  <option key={member.name} value={member.name}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[180px] flex-[2] flex-col gap-1">
              <span className="pl-3 text-xs font-medium text-muted-foreground">Description</span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add notes or job details"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/45"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="h-10 shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              Add Job
            </button>
          </form>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <ProcessSelector
            processes={processes}
            selectedProcessId={selectedProcessId}
            onSelect={setSelectedProcessId}
          />
          <button
            type="button"
            onClick={() => setView("kanban")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              view === "kanban"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            Kanban
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              view === "table"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            <Table2 className="h-4 w-4" />
            Table
          </button>
          <button
            type="button"
            onClick={() => setView("dashboard")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              view === "dashboard"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </button>
        </div>

        {view === "kanban" ? (
          <KanbanBoard
            jobs={jobs}
            pipeline={activePipeline}
            loading={loading}
            selectedTaskId={selectedTaskId}
            onMoveJob={moveJob}
            onSelectTask={openTask}
          />
        ) : view === "table" ? (
          <JobsTable
            jobs={jobs}
            loading={loading}
            selectedTaskId={selectedTaskId}
            onSelectTask={openTask}
          />
        ) : (
          <DashboardPanel
            jobs={jobs}
            pipeline={activePipeline}
            loading={loading}
            tab={dashboardTab}
            onTabChange={setDashboardTab}
          />
        )}
      </main>

      <TaskSidebar
        job={selectedJob}
        open={selectedJob !== null}
        teamMembers={assigneeOptions}
        onClose={() => setSelectedTaskId(null)}
        onSave={saveTask}
        onDelete={deleteTask}
        deleting={deletingTask}
      />

      <TeamMembersPanel
        open={teamPanelOpen}
        members={teamMembers}
        onClose={() => setTeamPanelOpen(false)}
        onChange={setTeamMembers}
        onRefresh={() => void loadJobs(selectedProcessId)}
      />

      <ProcessesPanel
        open={processPanelOpen}
        processes={processes}
        onClose={() => setProcessPanelOpen(false)}
        onChange={(next) => {
          setProcesses(next);
          setSelectedProcessId((current) =>
            current && next.some((entry) => entry.process_id === current)
              ? current
              : next[0]?.process_id ?? null
          );
        }}
      />
    </div>
  );
}

export default App;
