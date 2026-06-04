import type { StatusProps } from "@/components/ui/status";

export type JobStatus = "pre_work" | "machining" | "qc" | "dispatch";

export interface TeamMember {
  name: string;
  photo: string;
}

export interface Job {
  task_id: string;
  job_id: string;
  client_phone: string;
  description: string;
  status: JobStatus;
  status_label: string;
  author: string;
  assignee_name: string;
  assignee_photo: string;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_AUTHOR = "Shop Floor";

export const TEAM_MEMBERS: TeamMember[] = [
  {
    name: "Alex Chen",
    photo:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80",
  },
  {
    name: "Priya Sharma",
    photo:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80",
  },
  {
    name: "Marcus Webb",
    photo:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&h=100&q=80",
  },
  {
    name: "Elena Rossi",
    photo:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=100&h=100&q=80",
  },
];

export const DEFAULT_ASSIGNEE = TEAM_MEMBERS[0];

export const PIPELINE: { key: JobStatus; label: string; color: string }[] = [
  { key: "pre_work", label: "Pre-Work", color: "#6366f1" },
  { key: "machining", label: "Machining", color: "#f59e0b" },
  { key: "qc", label: "QC", color: "#10b981" },
  { key: "dispatch", label: "Dispatch", color: "#22c55e" },
];

export const CLIENT_AVATARS = TEAM_MEMBERS.map((member) => member.photo);

export const JOB_STATUS_VISUAL: Record<JobStatus, StatusProps["status"]> = {
  pre_work: "maintenance",
  machining: "online",
  qc: "degraded",
  dispatch: "online",
};

export function initialsForName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function findTeamMember(name: string): TeamMember | undefined {
  return TEAM_MEMBERS.find(
    (member) => member.name.toLowerCase() === name.toLowerCase()
  );
}

/** Payload encoded in each task QR — matches floor scan parser in app.py */
export function getTaskScanPayload(taskId: string, jobId?: string): string {
  return JSON.stringify({
    task_id: taskId,
    ...(jobId ? { job_id: jobId } : {}),
  });
}

export function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
