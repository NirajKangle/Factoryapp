import { type Job, type JobStatus, type ProcessStage } from "@/lib/job-status";

export type DashboardTab = "overview" | "pipeline" | "team" | "production";

export interface StatusCount {
  status: JobStatus;
  label: string;
  color: string;
  count: number;
}

export interface AssigneeCount {
  name: string;
  count: number;
}

export interface PipelineStageStat {
  status: JobStatus;
  label: string;
  color: string;
  count: number;
  oldestJobId: string | null;
  oldestDays: number;
  avgDays: number;
}

export interface AssigneeStatusBreakdown {
  name: string;
  photo: string;
  total: number;
  byStatus: Record<JobStatus, number>;
}

export interface ProductionJobStat {
  jobId: string;
  taskId: string;
  assignee: string;
  requested: number;
  good: number;
  scrap: number;
  yieldPercent: number | null;
}

export interface ProductionSummary {
  hasData: boolean;
  totalRequested: number;
  totalGood: number;
  totalScrap: number;
  yieldPercent: number | null;
  jobStats: ProductionJobStat[];
  assigneeYield: { name: string; good: number; scrap: number; yieldPercent: number | null }[];
  progressJobs: { jobId: string; assignee: string; progress: number }[];
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function countByStatus(jobs: Job[], pipeline: ProcessStage[]): StatusCount[] {
  return pipeline.map((stage) => ({
    status: stage.status_key,
    label: stage.label,
    color: stage.color,
    count: jobs.filter((job) => job.status === stage.status_key).length,
  }));
}

export function countByAssignee(jobs: Job[]): AssigneeCount[] {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const name = job.assignee_name?.trim() || "Unassigned";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function pipelineStageStats(
  jobs: Job[],
  pipeline: ProcessStage[]
): PipelineStageStat[] {
  return pipeline.map((stage) => {
    const stageJobs = jobs.filter((job) => job.status === stage.status_key);
    const ages = stageJobs.map((job) => daysSince(job.updated_at));
    const oldest = stageJobs.reduce<Job | null>((current, job) => {
      if (!current) return job;
      return new Date(job.updated_at) < new Date(current.updated_at) ? job : current;
    }, null);

    return {
      status: stage.status_key,
      label: stage.label,
      color: stage.color,
      count: stageJobs.length,
      oldestJobId: oldest?.job_id ?? null,
      oldestDays: oldest ? daysSince(oldest.updated_at) : 0,
      avgDays:
        ages.length > 0
          ? Math.round((ages.reduce((sum, value) => sum + value, 0) / ages.length) * 10) / 10
          : 0,
    };
  });
}

export function assigneeBreakdown(
  jobs: Job[],
  pipeline: ProcessStage[]
): AssigneeStatusBreakdown[] {
  const map = new Map<string, AssigneeStatusBreakdown>();
  const emptyStatusMap = () =>
    Object.fromEntries(pipeline.map((stage) => [stage.status_key, 0])) as Record<
      JobStatus,
      number
    >;

  for (const job of jobs) {
    const name = job.assignee_name?.trim() || "Unassigned";
    const existing = map.get(name) ?? {
      name,
      photo: job.assignee_photo ?? "",
      total: 0,
      byStatus: emptyStatusMap(),
    };
    existing.total += 1;
    existing.byStatus[job.status] += 1;
    map.set(name, existing);
  }

  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function productionSummary(jobs: Job[]): ProductionSummary {
  const jobStats: ProductionJobStat[] = jobs
    .map((job) => {
      const good = job.good_parts_count ?? 0;
      const scrap = job.scrap_parts_count ?? 0;
      const requested = job.total_requested_quantity ?? 0;
      const total = good + scrap;
      return {
        jobId: job.job_id,
        taskId: job.task_id,
        assignee: job.assignee_name,
        requested,
        good,
        scrap,
        yieldPercent: total > 0 ? Math.round((good / total) * 1000) / 10 : null,
      };
    })
    .filter((entry) => entry.requested > 0 || entry.good > 0 || entry.scrap > 0)
    .sort((a, b) => b.good + b.scrap - (a.good + a.scrap));

  const totalGood = jobStats.reduce((sum, entry) => sum + entry.good, 0);
  const totalScrap = jobStats.reduce((sum, entry) => sum + entry.scrap, 0);
  const totalRequested = jobStats.reduce((sum, entry) => sum + entry.requested, 0);
  const outputTotal = totalGood + totalScrap;

  const assigneeMap = new Map<string, { good: number; scrap: number }>();
  for (const entry of jobStats) {
    const current = assigneeMap.get(entry.assignee) ?? { good: 0, scrap: 0 };
    current.good += entry.good;
    current.scrap += entry.scrap;
    assigneeMap.set(entry.assignee, current);
  }

  const assigneeYield = [...assigneeMap.entries()]
    .map(([name, values]) => {
      const total = values.good + values.scrap;
      return {
        name,
        good: values.good,
        scrap: values.scrap,
        yieldPercent: total > 0 ? Math.round((values.good / total) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.good + b.scrap - (a.good + a.scrap));

  const progressJobs = jobs
    .filter((job) => job.tracking_mode === "progress" && (job.progress_percent ?? 0) > 0)
    .map((job) => ({
      jobId: job.job_id,
      assignee: job.assignee_name,
      progress: job.progress_percent ?? 0,
    }))
    .sort((a, b) => b.progress - a.progress);

  return {
    hasData: jobStats.length > 0 || progressJobs.length > 0,
    totalRequested,
    totalGood,
    totalScrap,
    yieldPercent:
      outputTotal > 0 ? Math.round((totalGood / outputTotal) * 1000) / 10 : null,
    jobStats: jobStats.slice(0, 10),
    assigneeYield,
    progressJobs,
  };
}
