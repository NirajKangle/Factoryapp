import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";

import { StatusBadge } from "@/components/ui/status-badge";
import { TaskQrCode } from "@/components/ui/task-qr-code";
import {
  findTeamMember,
  formatUpdatedAt,
  getTaskScanPayload,
  PIPELINE,
  TEAM_MEMBERS,
  type Job,
  type JobStatus,
} from "@/lib/job-status";
import { cn } from "@/lib/utils";

export interface TaskSidebarProps {
  job: Job | null;
  open: boolean;
  onClose: () => void;
  onSave: (taskId: string, data: TaskFormData) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  deleting?: boolean;
}

export interface TaskFormData {
  job_id: string;
  client_phone: string;
  client_email: string;
  description: string;
  status: JobStatus;
  assignee_name: string;
  assignee_photo: string;
  total_requested_quantity: number;
  good_parts_count: number;
  scrap_parts_count: number;
  tracking_mode: "unit" | "progress" | "checklist";
  progress_percent: number;
}

function toFormData(job: Job): TaskFormData {
  return {
    job_id: job.job_id,
    client_phone: job.client_phone,
    client_email: job.client_email ?? "",
    description: job.description ?? "",
    status: job.status,
    assignee_name: job.assignee_name,
    assignee_photo: job.assignee_photo,
    total_requested_quantity: job.total_requested_quantity ?? 1,
    good_parts_count: job.good_parts_count ?? 0,
    scrap_parts_count: job.scrap_parts_count ?? 0,
    tracking_mode: job.tracking_mode ?? "unit",
    progress_percent: job.progress_percent ?? 0,
  };
}

function formsEqual(a: TaskFormData, b: TaskFormData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function TaskSidebar({
  job,
  open,
  onClose,
  onSave,
  onDelete,
  deleting = false,
}: TaskSidebarProps) {
  const [form, setForm] = useState<TaskFormData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastSavedRef = useRef<TaskFormData | null>(null);
  const skipNextSaveRef = useRef(true);

  useEffect(() => {
    if (job) {
      const next = toFormData(job);
      setForm(next);
      lastSavedRef.current = next;
      skipNextSaveRef.current = true;
      setConfirmDelete(false);
      setSaveState("idle");
    }
  }, [job?.task_id, job?.updated_at]);

  useEffect(() => {
    if (!open || !job || !form) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (lastSavedRef.current && formsEqual(form, lastSavedRef.current)) {
      return;
    }

    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void onSave(job.task_id, form)
        .then(() => {
          lastSavedRef.current = form;
          setSaveState("saved");
          window.setTimeout(() => setSaveState("idle"), 1500);
        })
        .catch(() => {
          setSaveState("error");
        });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [form, job, onSave, open]);

  if (!open || !job || !form) {
    return null;
  }

  const activeJob = job;

  function updateField<K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function handleAssigneeChange(name: string) {
    const member = findTeamMember(name);
    setForm((current) =>
      current
        ? {
            ...current,
            assignee_name: name,
            assignee_photo: member?.photo ?? current.assignee_photo,
          }
        : current
    );
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete(activeJob.task_id);
  }

  function printQrLabel() {
    const printWindow = window.open("", "_blank", "width=420,height=520");
    if (!printWindow) return;

    const payload = getTaskScanPayload(activeJob.task_id, activeJob.job_id);
    const safeTitle = activeJob.job_id
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    printWindow.document.write(`<!DOCTYPE html>
<html><head><title>${safeTitle} — QR</title>
<style>
  body { font-family: system-ui, sans-serif; text-align: center; padding: 24px; }
  h1 { font-size: 1.25rem; margin-bottom: 8px; }
  p { color: #666; font-size: 0.875rem; }
</style>
<script src="https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js"><\/script>
</head><body>
<h1>${safeTitle}</h1>
<p>Scan at a floor station to update status</p>
<canvas id="qr"></canvas>
<script>
  QRCode.toCanvas(document.getElementById("qr"), ${JSON.stringify(payload)}, { width: 220, margin: 2 }, function () {
    setTimeout(function () { window.print(); }, 400);
  });
<\/script>
</body></html>`);
    printWindow.document.close();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close task view"
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col",
          "border-l border-border bg-card shadow-2xl"
        )}
        role="dialog"
        aria-labelledby="task-view-title"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Task view
              </p>
              {saveState === "saving" && (
                <span className="text-xs text-muted-foreground">Saving…</span>
              )}
              {saveState === "saved" && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>
              )}
              {saveState === "error" && (
                <span className="text-xs text-destructive">Save failed</span>
              )}
            </div>
            <h2 id="task-view-title" className="text-lg font-semibold text-foreground">
              {activeJob.job_id}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="mb-3 text-center text-sm font-medium text-foreground">
                Floor scan QR
              </p>
              <div className="flex justify-center">
                <TaskQrCode
                  taskId={activeJob.task_id}
                  jobId={activeJob.job_id}
                  size={140}
                  label={activeJob.job_id}
                />
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Point the shop-floor scanner at this code to move the job to that
                station&apos;s status.
              </p>
              <button
                type="button"
                onClick={printQrLabel}
                className="mt-3 w-full rounded-lg border border-border bg-background py-2 text-sm font-medium text-foreground hover:bg-muted/40"
              >
                Print label
              </button>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="task-job-id" className="text-sm font-medium text-foreground">
                Job ID
              </label>
              <input
                id="task-job-id"
                type="text"
                value={form.job_id}
                onChange={(e) => updateField("job_id", e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="task-phone" className="text-sm font-medium text-foreground">
                Client phone
              </label>
              <input
                id="task-phone"
                type="text"
                value={form.client_phone}
                onChange={(e) => updateField("client_phone", e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="task-email" className="text-sm font-medium text-foreground">
                Client email
              </label>
              <input
                id="task-email"
                type="email"
                value={form.client_email}
                onChange={(e) => updateField("client_email", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="task-qty" className="text-sm font-medium text-foreground">
                  Batch qty
                </label>
                <input
                  id="task-qty"
                  type="number"
                  min={1}
                  value={form.total_requested_quantity}
                  onChange={(e) =>
                    updateField("total_requested_quantity", Number(e.target.value) || 1)
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="task-good" className="text-sm font-medium text-foreground">
                  Good
                </label>
                <input
                  id="task-good"
                  type="number"
                  min={0}
                  value={form.good_parts_count}
                  onChange={(e) =>
                    updateField("good_parts_count", Number(e.target.value) || 0)
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="task-scrap" className="text-sm font-medium text-foreground">
                  Scrap
                </label>
                <input
                  id="task-scrap"
                  type="number"
                  min={0}
                  value={form.scrap_parts_count}
                  onChange={(e) =>
                    updateField("scrap_parts_count", Number(e.target.value) || 0)
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="task-tracking" className="text-sm font-medium text-foreground">
                Tracking mode
              </label>
              <select
                id="task-tracking"
                value={form.tracking_mode}
                onChange={(e) =>
                  updateField(
                    "tracking_mode",
                    e.target.value as TaskFormData["tracking_mode"]
                  )
                }
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground"
              >
                <option value="unit">Per-unit (QR)</option>
                <option value="progress">Progress %</option>
                <option value="checklist">Operations checklist</option>
              </select>
            </div>

            {form.tracking_mode === "progress" && (
              <div className="space-y-1.5">
                <label htmlFor="task-progress" className="text-sm font-medium text-foreground">
                  Progress %
                </label>
                <input
                  id="task-progress"
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress_percent}
                  onChange={(e) =>
                    updateField("progress_percent", Number(e.target.value) || 0)
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="task-assignee" className="text-sm font-medium text-foreground">
                Assignee
              </label>
              <select
                id="task-assignee"
                value={form.assignee_name}
                onChange={(e) => handleAssigneeChange(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground"
              >
                {TEAM_MEMBERS.map((member) => (
                  <option key={member.name} value={member.name}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Status</span>
              <div className="flex items-center gap-3">
                <StatusBadge status={form.status} />
                <select
                  id="task-status"
                  value={form.status}
                  onChange={(e) => updateField("status", e.target.value as JobStatus)}
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground"
                >
                  {PIPELINE.map((stage) => (
                    <option key={stage.key} value={stage.key}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="task-description" className="text-sm font-medium text-foreground">
                Description
              </label>
              <textarea
                id="task-description"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                rows={5}
                placeholder="Notes and job details"
                className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Author</span>
              <p className="rounded-lg border border-input bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
                {activeJob.author}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Created: </span>
                {formatUpdatedAt(activeJob.created_at)}
              </p>
              <p className="mt-1">
                <span className="font-medium text-foreground">Updated: </span>
                {formatUpdatedAt(activeJob.updated_at)}
              </p>
            </div>
          </div>

          <div className="border-t border-border px-5 py-4">
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60",
                confirmDelete
                  ? "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "border-border text-destructive hover:bg-destructive/10"
              )}
            >
              <Trash2 className="h-4 w-4" />
              {deleting
                ? "Deleting…"
                : confirmDelete
                  ? "Confirm delete"
                  : "Delete task"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export default TaskSidebar;
