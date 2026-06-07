import type { TeamMember } from "@/lib/job-status";

export interface TeamMemberRecord extends TeamMember {
  member_id: number;
  job_title?: string;
  created_at?: string;
  modified_at?: string | null;
}

export const DEFAULT_TEAM_JOB_TITLE = "Operator";

export async function fetchTeamMembers(): Promise<TeamMemberRecord[]> {
  const response = await fetch("/api/team-members", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Could not load team members.");
  }
  return response.json();
}

export async function addTeamMember(name: string): Promise<TeamMemberRecord> {
  const response = await fetch("/api/team-members", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ name: name.trim() }),
  });
  const payload = (await response.json().catch(() => null)) as
    | TeamMemberRecord
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      payload && "error" in payload && payload.error
        ? payload.error
        : "Could not add team member."
    );
  }
  return payload as TeamMemberRecord;
}

export async function updateTeamMember(
  memberId: number,
  data: { name?: string; photo?: string; job_title?: string }
): Promise<TeamMemberRecord> {
  const response = await fetch(`/api/team-members/${memberId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(data),
  });
  const payload = (await response.json().catch(() => null)) as
    | TeamMemberRecord
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      payload && "error" in payload && payload.error
        ? payload.error
        : "Could not update team member."
    );
  }
  return payload as TeamMemberRecord;
}

export async function uploadTeamMemberPhoto(
  memberId: number,
  file: File
): Promise<TeamMemberRecord> {
  const body = new FormData();
  body.append("photo", file);
  const response = await fetch(`/api/team-members/${memberId}/photo`, {
    method: "POST",
    body,
  });
  const payload = (await response.json().catch(() => null)) as
    | TeamMemberRecord
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      payload && "error" in payload && payload.error
        ? payload.error
        : "Could not upload photo."
    );
  }
  return payload as TeamMemberRecord;
}

export async function removeTeamMember(memberId: number): Promise<void> {
  const response = await fetch(`/api/team-members/${memberId}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? "Could not remove team member.");
  }
}

export function findTeamMemberRecord(
  members: TeamMember[],
  name: string
): TeamMember | undefined {
  return members.find(
    (member) => member.name.toLowerCase() === name.toLowerCase()
  );
}
