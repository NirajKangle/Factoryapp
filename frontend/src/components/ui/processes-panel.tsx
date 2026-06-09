import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProcessStage } from "@/lib/job-status";
import {
  createProcess,
  deleteProcess,
  type ProcessRecord,
  updateProcess,
} from "@/lib/processes";
import { cn } from "@/lib/utils";

type PanelView = "list" | "flow" | "edit" | "create";

const DEFAULT_NEW_STEPS = [
  { label: "Start", color: "#6366f1" },
  { label: "In Progress", color: "#f59e0b" },
  { label: "Complete", color: "#22c55e" },
];

export interface ProcessesPanelProps {
  open: boolean;
  processes: ProcessRecord[];
  onClose: () => void;
  onChange: (processes: ProcessRecord[]) => void;
}

function sortProcesses(processes: ProcessRecord[]) {
  return [...processes].sort((a, b) => a.name.localeCompare(b.name));
}

function toEditableSteps(statuses: ProcessStage[]) {
  return statuses.map((entry, index) => ({
    status_id: entry.status_id,
    status_key: entry.status_key,
    label: entry.label,
    color: entry.color,
    sort_order: entry.sort_order ?? index,
  }));
}

function ProcessFlowchart({ statuses }: { statuses: ProcessStage[] }) {
  if (statuses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No workflow steps defined yet.</p>
    );
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-center gap-2 py-2">
        {statuses.map((step, index) => (
          <div key={step.status_key} className="flex items-center gap-2">
            <div
              className="min-w-[7rem] rounded-xl border border-border bg-card px-4 py-3 text-center shadow-sm"
              style={{ borderTopColor: step.color, borderTopWidth: "3px" }}
            >
              <p className="text-sm font-semibold text-foreground">{step.label}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Step {index + 1}
              </p>
            </div>
            {index < statuses.length - 1 ? (
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProcessesPanel({
  open,
  processes,
  onClose,
  onChange,
}: ProcessesPanelProps) {
  const [view, setView] = useState<PanelView>("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<ProcessStage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProcess =
    processes.find((entry) => entry.process_id === selectedId) ?? null;

  useEffect(() => {
    if (!open) {
      setView("list");
      setSelectedId(null);
      setName("");
      setSteps([]);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  function openFlow(process: ProcessRecord) {
    setSelectedId(process.process_id);
    setView("flow");
    setError(null);
  }

  function startCreate() {
    setSelectedId(null);
    setName("");
    setSteps(
      DEFAULT_NEW_STEPS.map((entry, index) => ({
        status_key: `step_${index + 1}`,
        label: entry.label,
        sort_order: index,
        color: entry.color,
      }))
    );
    setView("create");
    setError(null);
  }

  function startEdit() {
    if (!selectedProcess) return;
    setName(selectedProcess.name);
    setSteps(toEditableSteps(selectedProcess.statuses));
    setView("edit");
    setError(null);
  }

  function updateStep(index: number, field: "label" | "color", value: string) {
    setSteps((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry
      )
    );
  }

  function addStep() {
    setSteps((current) => [
      ...current,
      {
        status_key: `step_${current.length + 1}`,
        label: `Step ${current.length + 1}`,
        sort_order: current.length,
        color: "#8b5cf6",
      },
    ]);
  }

  function removeStep(index: number) {
    setSteps((current) => current.filter((_, entryIndex) => entryIndex !== index));
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    try {
      const created = await createProcess(
        trimmed,
        steps.map((entry, index) => ({
          ...entry,
          sort_order: index,
        }))
      );
      onChange(sortProcesses([...processes, created]));
      openFlow(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create process.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedProcess) return;

    setBusy(true);
    setError(null);
    try {
      const updated = await updateProcess(selectedProcess.process_id, {
        name: name.trim(),
        statuses: steps.map((entry, index) => ({
          ...entry,
          sort_order: index,
        })),
      });
      onChange(
        sortProcesses(
          processes.map((entry) =>
            entry.process_id === updated.process_id ? updated : entry
          )
        )
      );
      setSelectedId(updated.process_id);
      setView("flow");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save process.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!selectedProcess) return;
    if (!window.confirm(`Delete process "${selectedProcess.name}"?`)) return;

    setBusy(true);
    setError(null);
    try {
      await deleteProcess(selectedProcess.process_id);
      onChange(processes.filter((entry) => entry.process_id !== selectedProcess.process_id));
      setView("list");
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete process.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-background shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            {view !== "list" ? (
              <button
                type="button"
                onClick={() => setView(view === "edit" || view === "create" ? (view === "create" ? "list" : "flow") : "list")}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : null}
            <h2 className="text-lg font-semibold text-foreground">
              {view === "list"
                ? "Processes"
                : view === "create"
                  ? "New process"
                  : view === "edit"
                    ? "Edit process"
                    : selectedProcess?.name ?? "Process"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {error ? (
            <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {view === "list" ? (
            <div className="space-y-4">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  startCreate();
                }}
              >
                <Button type="button" onClick={startCreate} className="w-full gap-2">
                  <Plus className="h-4 w-4" />
                  Add new process
                </Button>
              </form>

              <div className="space-y-2">
                {processes.map((process) => (
                  <button
                    key={process.process_id}
                    type="button"
                    onClick={() => openFlow(process)}
                    className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent"
                  >
                    <div>
                      <p className="font-medium text-foreground">{process.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {process.statuses.length} step
                        {process.statuses.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {view === "flow" && selectedProcess ? (
            <div className="space-y-4">
              <ProcessFlowchart statuses={selectedProcess.statuses} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={startEdit} className="gap-2">
                  <Pencil className="h-4 w-4" />
                  Edit workflow
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleDelete()}
                  disabled={busy || processes.length <= 1}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          ) : null}

          {view === "create" || view === "edit" ? (
            <form
              onSubmit={view === "create" ? handleCreate : handleSaveEdit}
              className="space-y-4"
            >
              <label className="block space-y-1">
                <span className="text-sm font-medium text-foreground">Process name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Welding"
                  required
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                />
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Workflow steps</span>
                  <Button type="button" variant="outline" size="sm" onClick={addStep}>
                    Add step
                  </Button>
                </div>
                <ProcessFlowchart
                  statuses={steps.map((entry, index) => ({
                    ...entry,
                    sort_order: index,
                  }))}
                />
                {steps.map((step, index) => (
                  <div
                    key={`${step.status_key}-${index}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
                  >
                    <input
                      value={step.label}
                      onChange={(event) => updateStep(index, "label", event.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                      required
                    />
                    <input
                      type="color"
                      value={step.color}
                      onChange={(event) => updateStep(index, "color", event.target.value)}
                      className="h-9 w-10 shrink-0 cursor-pointer rounded border border-input bg-background"
                      aria-label={`Color for ${step.label}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeStep(index)}
                      disabled={steps.length <= 1}
                      className={cn(
                        "rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-destructive",
                        steps.length <= 1 && "opacity-40"
                      )}
                      aria-label="Remove step"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <Button type="submit" disabled={busy} className="w-full">
                {view === "create" ? "Create process" : "Save changes"}
              </Button>
            </form>
          ) : null}
        </div>
      </aside>
    </>
  );
}

export default ProcessesPanel;
