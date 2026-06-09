import { useRef, useState } from "react";
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
import { Plus } from "lucide-react";

import { AssigneeDisplay } from "@/components/ui/assignee-display";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskQrCode } from "@/components/ui/task-qr-code";
import { type Job, type JobStatus, type ProcessStage } from "@/lib/job-status";
import { cn } from "@/lib/utils";

export interface KanbanBoardProps {
  jobs: Job[];
  pipeline: ProcessStage[];
  loading?: boolean;
  selectedTaskId: string | null;
  onMoveJob: (taskId: string, targetStatus: JobStatus) => Promise<void>;
  onSelectTask: (job: Job) => void;
}

function isJobStatus(value: string, pipeline: ProcessStage[]): value is JobStatus {
  return pipeline.some((stage) => stage.status_key === value);
}

function resolveDropStatus(
  overId: string,
  jobs: Job[],
  pipeline: ProcessStage[]
): JobStatus | null {
  if (isJobStatus(overId, pipeline)) {
    return overId;
  }
  const job = jobs.find((entry) => entry.task_id === overId);
  return job?.status ?? null;
}

function JobCardContent({ job }: { job: Job }) {
  const description = (job.description ?? "").trim();

  return (
    <CardContent className="p-2.5">
      <div className="flex items-stretch gap-2.5">
        <div className="min-w-0 flex-1 space-y-1.5">
          <h4 className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
            {job.job_id}
          </h4>
          <StatusBadge
            status={job.status}
            label={job.status_label}
            color={job.status_color}
            className="px-2 py-0 text-[10px]"
          />
          <AssigneeDisplay
            name={job.assignee_name}
            photo={job.assignee_photo}
            dense
          />
          {description ? (
            <p className="line-clamp-1 text-xs text-muted-foreground/90">{description}</p>
          ) : null}
        </div>

        <div
          className="flex shrink-0 items-center"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <TaskQrCode
            taskId={job.task_id}
            jobId={job.job_id}
            size={56}
            isolatePointer
            className="[&>div]:p-1"
          />
        </div>
      </div>
    </CardContent>
  );
}

function DraggableJobCard({
  job,
  selectedTaskId,
  onSelectTask,
  suppressClickRef,
}: {
  job: Job;
  selectedTaskId: string | null;
  onSelectTask: (job: Job) => void;
  suppressClickRef: React.MutableRefObject<boolean>;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.task_id,
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
        "cursor-pointer border bg-card transition-all hover:border-primary/30 hover:shadow-md",
        isDragging && "opacity-40 shadow-none",
        selectedTaskId === job.task_id && "border-primary ring-2 ring-primary/25"
      )}
      {...listeners}
      {...attributes}
      onClick={() => {
        if (suppressClickRef.current) return;
        onSelectTask(job);
      }}
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
  selectedTaskId,
  onSelectTask,
  suppressClickRef,
}: {
  columnKey: JobStatus;
  label: string;
  color: string;
  jobs: Job[];
  loading: boolean;
  isOver: boolean;
  selectedTaskId: string | null;
  onSelectTask: (job: Job) => void;
  suppressClickRef: React.MutableRefObject<boolean>;
}) {
  const { setNodeRef } = useDroppable({
    id: columnKey,
    data: { status: columnKey, type: "column" },
  });

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-muted/20 p-4",
        isOver && "bg-primary/5 ring-2 ring-primary/30"
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="text-sm font-semibold text-foreground">{label}</h3>
          <Badge variant="secondary" className="h-5 px-1.5 text-xs font-normal">
            {jobs.length}
          </Badge>
        </div>
        <button
          type="button"
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary"
          aria-label={`Add job to ${label}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div ref={setNodeRef} className="min-h-[120px] space-y-2">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : jobs.length === 0 ? (
          <div className="flex min-h-[100px] items-center justify-center rounded-xl border border-dashed border-border/80 px-4 py-6 text-center text-sm text-muted-foreground">
            Drop jobs here
          </div>
        ) : (
          jobs.map((job) => (
            <DraggableJobCard
              key={job.task_id}
              job={job}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
              suppressClickRef={suppressClickRef}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({
  jobs,
  pipeline,
  loading = false,
  selectedTaskId,
  onMoveJob,
  onSelectTask,
}: KanbanBoardProps) {
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [overStatus, setOverStatus] = useState<JobStatus | null>(null);
  const suppressClickRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const columns = pipeline.map((stage) => ({
    key: stage.status_key,
    label: stage.label,
    color: stage.color,
    jobs: jobs.filter((job) => job.status === stage.status_key),
  }));

  function handleDragStart(event: DragStartEvent) {
    suppressClickRef.current = true;
    const job = event.active.data.current?.job as Job | undefined;
    setActiveJob(job ?? jobs.find((entry) => entry.task_id === event.active.id) ?? null);
  }

  function handleDragOver(event: { over: DragEndEvent["over"] }) {
    if (!event.over) {
      setOverStatus(null);
      return;
    }
    setOverStatus(resolveDropStatus(String(event.over.id), jobs, pipeline));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveJob(null);
    setOverStatus(null);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    if (!over) return;

    const taskId = String(active.id);
    const targetStatus = resolveDropStatus(String(over.id), jobs, pipeline);
    if (!targetStatus) return;

    void onMoveJob(taskId, targetStatus);
  }

  function handleDragCancel() {
    setActiveJob(null);
    setOverStatus(null);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        className={cn(
          "grid grid-cols-1 gap-4 md:grid-cols-2",
          pipeline.length >= 4 ? "xl:grid-cols-4" : pipeline.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-2"
        )}
      >
        {columns.map((column) => (
          <KanbanColumn
            key={column.key}
            columnKey={column.key}
            label={column.label}
            color={column.color}
            jobs={column.jobs}
            loading={loading}
            isOver={overStatus === column.key}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
            suppressClickRef={suppressClickRef}
          />
        ))}
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
