import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { AssigneeDisplay } from "@/components/ui/assignee-display";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskQrCode } from "@/components/ui/task-qr-code";
import type { Job } from "@/lib/job-status";
import { cn } from "@/lib/utils";

export interface JobsTableProps {
  jobs: Job[];
  loading?: boolean;
  selectedTaskId: string | null;
  onSelectTask: (job: Job) => void;
}

type SortKey = "name" | "date";
type SortDirection = "asc" | "desc";

export function JobsTable({
  jobs,
  loading,
  selectedTaskId,
  onSelectTask,
}: JobsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedJobs = useMemo(() => {
    const copy = [...jobs];
    copy.sort((a, b) => {
      let comparison = 0;
      if (sortKey === "name") {
        comparison = a.job_id.localeCompare(b.job_id, undefined, { sensitivity: "base" });
      } else {
        comparison =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return copy;
  }, [jobs, sortKey, sortDirection]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "name" ? "asc" : "desc");
  }

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">Loading jobs…</p>
    );
  }

  if (jobs.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No jobs yet. Add one above.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Sort by</span>
        <SortButton
          label="Name"
          active={sortKey === "name"}
          direction={sortKey === "name" ? sortDirection : undefined}
          onClick={() => toggleSort("name")}
        />
        <SortButton
          label="Date"
          active={sortKey === "date"}
          direction={sortKey === "date" ? sortDirection : undefined}
          onClick={() => toggleSort("date")}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left">
            <th className="px-2 py-3 font-medium text-muted-foreground">QR</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Job</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Assignee</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Phone</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Description</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody>
            {sortedJobs.map((job) => (
              <tr
                key={job.task_id}
                onClick={() => onSelectTask(job)}
                className={cn(
                  "cursor-pointer border-b border-border/50 transition-colors last:border-0",
                  "hover:bg-muted/30",
                  selectedTaskId === job.task_id && "bg-primary/5"
                )}
              >
              <td
                className="px-2 py-2"
                onClick={(e) => e.stopPropagation()}
              >
                <TaskQrCode taskId={job.task_id} jobId={job.job_id} size={44} />
              </td>
              <td className="px-4 py-3 font-medium text-foreground">{job.job_id}</td>
                <td className="px-4 py-3">
                  <AssigneeDisplay
                    name={job.assignee_name}
                    photo={job.assignee_photo}
                    compact
                  />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{job.client_phone}</td>
                <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                  {(job.description ?? "").trim() || "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={job.status} label={job.status_label} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(job.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction?: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      {active && direction === "asc" ? (
        <ArrowUp className="h-3 w-3" />
      ) : active && direction === "desc" ? (
        <ArrowDown className="h-3 w-3" />
      ) : null}
    </button>
  );
}

export default JobsTable;
