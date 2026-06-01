import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, GripVertical, Phone, Plus } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  CLIENT_AVATARS,
  formatUpdatedAt,
  PIPELINE,
  type Job,
  type JobStatus,
} from "@/lib/job-status";
import { cn } from "@/lib/utils";

export interface KanbanBoardProps {
  jobs: Job[];
  loading?: boolean;
  onMoveJob: (jobId: string, targetStatus: JobStatus) => Promise<void>;
}

function avatarForJob(jobId: string): string {
  const index = jobId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return CLIENT_AVATARS[index % CLIENT_AVATARS.length];
}

function initialsFromJobId(jobId: string): string {
  const parts = jobId.split(/[-_\s]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return jobId.slice(0, 2).toUpperCase();
}

function isJobStatus(value: string): value is JobStatus {
  return PIPELINE.some((stage) => stage.key === value);
}

function resolveDropStatus(overId: string, jobs: Job[]): JobStatus | null {
  if (isJobStatus(overId)) {
    return overId;
  }
  const job = jobs.find((entry) => entry.job_id === overId);
  return job?.status ?? null;
}

function JobCardContent({ job }: { job: Job }) {
  return (
    <CardContent className="p-5">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold leading-tight text-foreground">{job.job_id}</h4>
          <GripVertical className="h-5 w-5 shrink-0 text-muted-foreground" />
        </div>

        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Phone className="h-4 w-4" />
          {job.client_phone}
        </p>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs">
            {job.status_label}
          </Badge>
          {job.status === "dispatch" && (
            <Badge className="text-xs">Ready for pickup</Badge>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/50 pt-2">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="text-xs font-medium">{formatUpdatedAt(job.updated_at)}</span>
          </div>

          <Avatar className="h-8 w-8 ring-2 ring-background">
            <AvatarImage src={avatarForJob(job.job_id)} alt={job.job_id} />
            <AvatarFallback className="text-xs font-medium">
              {initialsFromJobId(job.job_id)}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </CardContent>
  );
}

function DraggableJobCard({ job }: { job: Job }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.job_id,
    data: { job, type: "job" },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "touch-none border bg-card/80 backdrop-blur-sm transition-shadow hover:bg-card",
        isDragging && "opacity-40 shadow-none"
      )}
      {...listeners}
      {...attributes}
    >
      <JobCardContent job={job} />
    </Card>
  );
}

function KanbanColumn({
  columnKey,
  label,
  color,
  jobs,
  loading,
  isOver,
}: {
  columnKey: JobStatus;
  label: string;
  color: string;
  jobs: Job[];
  loading: boolean;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: columnKey,
    data: { status: columnKey, type: "column" },
  });

  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-card/40 p-5 backdrop-blur-xl transition-colors",
        isOver && "bg-primary/10 ring-2 ring-primary/40"
      )}
    >
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="font-semibold text-foreground">{label}</h3>
          <Badge variant="secondary">{jobs.length}</Badge>
        </div>
        <button
          type="button"
          className="rounded-full p-1 transition-colors hover:bg-secondary"
          aria-label={`Add job to ${label}`}
        >
          <Plus className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div ref={setNodeRef} className="min-h-[160px] space-y-4">
        {loading ? (
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        ) : jobs.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Drop jobs here
          </div>
        ) : (
          jobs.map((job) => <DraggableJobCard key={job.job_id} job={job} />)
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({ jobs, loading = false, onMoveJob }: KanbanBoardProps) {
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [overStatus, setOverStatus] = useState<JobStatus | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const columns = PIPELINE.map((stage) => ({
    ...stage,
    jobs: jobs.filter((job) => job.status === stage.key),
  }));

  function handleDragStart(event: DragStartEvent) {
    const job = event.active.data.current?.job as Job | undefined;
    setActiveJob(job ?? jobs.find((entry) => entry.job_id === event.active.id) ?? null);
  }

  function handleDragOver(event: { over: DragEndEvent["over"] }) {
    if (!event.over) {
      setOverStatus(null);
      return;
    }
    setOverStatus(resolveDropStatus(String(event.over.id), jobs));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveJob(null);
    setOverStatus(null);

    if (!over) return;

    const jobId = String(active.id);
    const targetStatus = resolveDropStatus(String(over.id), jobs);
    if (!targetStatus) return;

    void onMoveJob(jobId, targetStatus);
  }

  function handleDragCancel() {
    setActiveJob(null);
    setOverStatus(null);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div>
        <div className="mb-6 text-center">
          <h2 className="mb-2 text-2xl font-light text-foreground">Job Pipeline</h2>
          <p className="text-muted-foreground">Drag and drop jobs between stages</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {columns.map((column) => (
            <KanbanColumn
              key={column.key}
              columnKey={column.key}
              label={column.label}
              color={column.color}
              jobs={column.jobs}
              loading={loading}
              isOver={overStatus === column.key}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeJob ? (
          <Card className="cursor-grabbing border bg-card shadow-lg">
            <JobCardContent job={activeJob} />
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default KanbanBoard;
