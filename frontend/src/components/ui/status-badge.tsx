import { PIPELINE, type JobStatus } from "@/lib/job-status";
import { cn } from "@/lib/utils";

export interface StatusBadgeProps {
  status: JobStatus;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const stage = PIPELINE.find((entry) => entry.key === status);
  const color = stage?.color ?? "#64748b";
  const text = label ?? stage?.label ?? status;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white",
        className
      )}
      style={{ backgroundColor: color }}
    >
      {text}
    </span>
  );
}

export default StatusBadge;
