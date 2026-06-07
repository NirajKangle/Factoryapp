import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil, Trash2, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TeamMemberPhoto } from "@/components/ui/team-member-photo";
import type { TeamMemberRecord } from "@/lib/team-members";
import {
  addTeamMember,
  DEFAULT_TEAM_JOB_TITLE,
  removeTeamMember,
  updateTeamMember,
  uploadTeamMemberPhoto,
} from "@/lib/team-members";
import { formatUpdatedAt, initialsForName } from "@/lib/job-status";
import { cn } from "@/lib/utils";

type PanelView = "list" | "profile" | "edit";

export interface TeamMembersPanelProps {
  open: boolean;
  members: TeamMemberRecord[];
  onClose: () => void;
  onChange: (members: TeamMemberRecord[]) => void;
  onRefresh?: () => void;
}

function sortMembers(members: TeamMemberRecord[]) {
  return [...members].sort((a, b) => a.name.localeCompare(b.name));
}

function replaceMember(
  members: TeamMemberRecord[],
  updated: TeamMemberRecord
): TeamMemberRecord[] {
  return sortMembers(
    members.map((member) =>
      member.member_id === updated.member_id ? updated : member
    )
  );
}

export function TeamMembersPanel({
  open,
  members,
  onClose,
  onChange,
  onRefresh,
}: TeamMembersPanelProps) {
  const [view, setView] = useState<PanelView>("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [editName, setEditName] = useState("");
  const [editJobTitle, setEditJobTitle] = useState(DEFAULT_TEAM_JOB_TITLE);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const selectedMember =
    members.find((member) => member.member_id === selectedId) ?? null;

  useEffect(() => {
    if (!open) {
      setView("list");
      setSelectedId(null);
      setName("");
      setEditName("");
      setEditJobTitle(DEFAULT_TEAM_JOB_TITLE);
      setPhotoPreview(null);
      setPhotoFile(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  if (!open) return null;

  function openProfile(member: TeamMemberRecord) {
    setSelectedId(member.member_id);
    setView("profile");
    setError(null);
  }

  function startEdit() {
    if (!selectedMember) return;
    setEditName(selectedMember.name);
    setEditJobTitle(selectedMember.job_title || DEFAULT_TEAM_JOB_TITLE);
    setPhotoPreview(null);
    setPhotoFile(null);
    setView("edit");
    setError(null);
  }

  function handlePhotoPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (photoPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    event.target.value = "";
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    try {
      const created = await addTeamMember(trimmed);
      onChange(sortMembers([...members, created]));
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add operator.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(memberId: number) {
    setBusy(true);
    setError(null);
    try {
      await removeTeamMember(memberId);
      onChange(members.filter((member) => member.member_id !== memberId));
      setView("list");
      setSelectedId(null);
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove operator.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProfile() {
    if (!selectedMember) return;

    setBusy(true);
    setError(null);
    try {
      let updated = selectedMember;
      const trimmedName = editName.trim();
      const trimmedTitle = editJobTitle.trim() || DEFAULT_TEAM_JOB_TITLE;
      if (!trimmedName) {
        throw new Error("Operator name is required.");
      }

      const patch: { name?: string; job_title?: string } = {};
      if (trimmedName !== selectedMember.name) {
        patch.name = trimmedName;
      }
      if (trimmedTitle !== (selectedMember.job_title || DEFAULT_TEAM_JOB_TITLE)) {
        patch.job_title = trimmedTitle;
      }
      if (Object.keys(patch).length > 0) {
        updated = await updateTeamMember(selectedMember.member_id, patch);
      }
      if (photoFile) {
        updated = await uploadTeamMemberPhoto(selectedMember.member_id, photoFile);
      }

      onChange(replaceMember(members, updated));
      setSelectedId(updated.member_id);
      setPhotoFile(null);
      setPhotoPreview(null);
      setView("profile");
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setBusy(false);
    }
  }

  const displayPhoto =
    photoPreview || selectedMember?.photo || undefined;

  return (
    <>
      <button
        type="button"
        aria-label="Close team members"
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col",
          "border-l border-border bg-card shadow-2xl"
        )}
        role="dialog"
        aria-labelledby="team-members-title"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            {view !== "list" ? (
              <button
                type="button"
                onClick={() => {
                  setView(view === "edit" ? "profile" : "list");
                  setError(null);
                  setPhotoFile(null);
                  setPhotoPreview(null);
                }}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Go back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : null}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Operators
              </p>
              <h2 id="team-members-title" className="text-lg font-semibold text-foreground">
                {view === "list"
                  ? "Team Members"
                  : view === "edit"
                    ? "Edit profile"
                    : selectedMember?.name}
              </h2>
            </div>
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

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          {view === "list" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Tap a team member to view their profile. Assignees on jobs sync from
                this list.
              </p>

              <form onSubmit={(event) => void handleAdd(event)} className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Operator name"
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  disabled={busy}
                />
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  Add
                </button>
              </form>

              <ul className="space-y-2">
                {members.map((member) => (
                  <li key={member.member_id}>
                    <button
                      type="button"
                      onClick={() => openProfile(member)}
                      className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={member.photo} alt={member.name} />
                          <AvatarFallback className="text-xs font-medium">
                            {initialsForName(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="block font-medium text-foreground">
                            {member.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {member.job_title || DEFAULT_TEAM_JOB_TITLE}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {view === "profile" && selectedMember ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-muted/20 p-6 text-center">
                <TeamMemberPhoto
                  name={selectedMember.name}
                  photo={selectedMember.photo}
                  size={112}
                />
                <h3 className="mt-4 text-xl font-semibold text-foreground">
                  {selectedMember.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedMember.job_title || DEFAULT_TEAM_JOB_TITLE}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
                {selectedMember.created_at ? (
                  <p>
                    <span className="font-medium text-foreground">Added: </span>
                    {formatUpdatedAt(selectedMember.created_at)}
                  </p>
                ) : null}
                {selectedMember.modified_at ? (
                  <p className="mt-1">
                    <span className="font-medium text-foreground">Updated: </span>
                    {formatUpdatedAt(selectedMember.modified_at)}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={startEdit}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground hover:bg-muted/40"
              >
                <Pencil className="h-4 w-4" />
                Edit profile
              </button>

              <button
                type="button"
                onClick={() => void handleRemove(selectedMember.member_id)}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/40 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Remove from team
              </button>
            </div>
          ) : null}

          {view === "edit" && selectedMember ? (
            <div className="space-y-5">
              <TeamMemberPhoto
                name={editName || selectedMember.name}
                photo={displayPhoto}
                size={112}
                editable
                disabled={busy}
                onPhotoClick={() => photoInputRef.current?.click()}
              />
              <p className="-mt-1 text-center text-xs text-muted-foreground">
                Tap photo to upload a new picture
              </p>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoPick}
              />

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Name</span>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                  disabled={busy}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Job title</span>
                <input
                  type="text"
                  value={editJobTitle}
                  onChange={(e) => setEditJobTitle(e.target.value)}
                  placeholder="e.g. CNC Operator"
                  className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                  disabled={busy}
                />
              </label>

              <button
                type="button"
                onClick={() => void handleSaveProfile()}
                disabled={busy || !editName.trim()}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save profile"}
              </button>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </aside>
    </>
  );
}

export default TeamMembersPanel;
