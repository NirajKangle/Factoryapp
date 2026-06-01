import type { StatusProps } from "@/components/ui/status";

export type JobStatus = "pre_work" | "machining" | "qc" | "dispatch";

export interface Job {
  job_id: string;
  client_phone: string;
  status: JobStatus;
  status_label: string;
  created_at: string;
  updated_at: string;
}

export const PIPELINE: { key: JobStatus; label: string; color: string }[] = [
  { key: "pre_work", label: "Pre-Work", color: "#6366f1" },
  { key: "machining", label: "Machining", color: "#f59e0b" },
  { key: "qc", label: "QC", color: "#10b981" },
  { key: "dispatch", label: "Dispatch", color: "#22c55e" },
];

export const CLIENT_AVATARS = [
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&h=100&q=80",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=100&h=100&q=80",
];

export const JOB_STATUS_VISUAL: Record<JobStatus, StatusProps["status"]> = {
  pre_work: "maintenance",
  machining: "online",
  qc: "degraded",
  dispatch: "online",
};

export function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
