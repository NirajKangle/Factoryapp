import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  assigneeBreakdown,
  countByAssignee,
  countByStatus,
  pipelineStageStats,
  productionSummary,
  type DashboardTab,
} from "@/lib/dashboard-analytics";
import { type Job, type ProcessStage } from "@/lib/job-status";
import { cn } from "@/lib/utils";

export const DASHBOARD_TABS: { id: DashboardTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "pipeline", label: "Pipeline" },
  { id: "team", label: "Team" },
  { id: "production", label: "Production" },
];

export interface DashboardPanelProps {
  jobs: Job[];
  pipeline: ProcessStage[];
  loading: boolean;
  tab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
}

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(0 0% 8%)",
  border: "1px solid hsl(240 4% 26%)",
  borderRadius: "0.5rem",
  color: "hsl(0 0% 98%)",
};

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function DashboardLoading() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
      Loading dashboard data…
    </div>
  );
}

function OverviewDashboard({
  jobs,
  pipeline,
}: {
  jobs: Job[];
  pipeline: ProcessStage[];
}) {
  const statusCounts = countByStatus(jobs, pipeline);
  const assigneeCounts = countByAssignee(jobs);
  const pieData = statusCounts.filter((entry) => entry.count > 0);
  const topStages = statusCounts.slice(0, 4);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Total jobs" value={jobs.length} />
        {topStages.map((stage) => (
          <KpiCard key={stage.status} label={stage.label} value={stage.count} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Jobs by status</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <EmptyChart message="No jobs yet." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.status} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Jobs by assignee</CardTitle>
          </CardHeader>
          <CardContent>
            {assigneeCounts.length === 0 ? (
              <EmptyChart message="No assignee data yet." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={assigneeCounts} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 4% 26%)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "hsl(240 5% 65%)", fontSize: 12 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis allowDecimals={false} tick={{ fill: "hsl(240 5% 65%)", fontSize: 12 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill="hsl(217.2 91.2% 59.8%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PipelineDashboard({
  jobs,
  pipeline,
}: {
  jobs: Job[];
  pipeline: ProcessStage[];
}) {
  const stages = pipelineStageStats(jobs, pipeline);
  const funnelData = stages.map((stage) => ({
    label: stage.label,
    count: stage.count,
    color: stage.color,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pipeline funnel</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <EmptyChart message="No jobs in the pipeline." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={funnelData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 4% 26%)" />
                <XAxis dataKey="label" tick={{ fill: "hsl(240 5% 65%)", fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(240 5% 65%)", fontSize: 12 }} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {funnelData.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Stage details</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 pb-2 sm:px-6">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Count</th>
                <th className="px-4 py-2 font-medium">Oldest job</th>
                <th className="px-4 py-2 font-medium">Avg days in stage</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((stage) => (
                <tr key={stage.status} className="border-b border-border/60">
                  <td className="px-4 py-2.5 font-medium text-foreground">{stage.label}</td>
                  <td className="px-4 py-2.5 text-foreground">{stage.count}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {stage.oldestJobId ? `${stage.oldestJobId} (${stage.oldestDays}d)` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {stage.count > 0 ? `${stage.avgDays}d` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function TeamDashboard({
  jobs,
  pipeline,
}: {
  jobs: Job[];
  pipeline: ProcessStage[];
}) {
  const breakdown = assigneeBreakdown(jobs, pipeline);
  const stackedData = breakdown.map((entry) => ({
    name: entry.name,
    ...entry.byStatus,
  }));

  const statusKeys = pipeline.map((stage) => stage.status_key);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Workload by assignee</CardTitle>
        </CardHeader>
        <CardContent>
          {breakdown.length === 0 ? (
            <EmptyChart message="No team workload data yet." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                layout="vertical"
                data={breakdown}
                margin={{ left: 8, right: 16, top: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 4% 26%)" />
                <XAxis type="number" allowDecimals={false} tick={{ fill: "hsl(240 5% 65%)", fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fill: "hsl(240 5% 65%)", fontSize: 12 }}
                />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="total" fill="hsl(217.2 91.2% 59.8%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Assignee breakdown by status</CardTitle>
        </CardHeader>
        <CardContent>
          {stackedData.length === 0 ? (
            <EmptyChart message="No status breakdown yet." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stackedData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 4% 26%)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "hsl(240 5% 65%)", fontSize: 12 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(240 5% 65%)", fontSize: 12 }} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend />
                {pipeline.map((stage) => (
                  <Bar
                    key={stage.status_key}
                    dataKey={stage.status_key}
                    name={stage.label}
                    stackId="status"
                    fill={stage.color}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Team summary</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 pb-2 sm:px-6">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Assignee</th>
                <th className="px-4 py-2 font-medium">Total</th>
                {pipeline.map((stage) => (
                  <th key={stage.status_key} className="px-4 py-2 font-medium">
                    {stage.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {breakdown.map((entry) => (
                <tr key={entry.name} className="border-b border-border/60">
                  <td className="px-4 py-2.5 font-medium text-foreground">{entry.name}</td>
                  <td className="px-4 py-2.5 text-foreground">{entry.total}</td>
                  {statusKeys.map((status) => (
                    <td key={status} className="px-4 py-2.5 text-muted-foreground">
                      {entry.byStatus[status]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ProductionDashboard({ jobs }: { jobs: Job[] }) {
  const summary = productionSummary(jobs);

  if (!summary.hasData) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No production data yet. Add quantities, good parts, or scrap counts in a job&apos;s
          details to see metrics here.
        </CardContent>
      </Card>
    );
  }

  const partsData = summary.jobStats.map((entry) => ({
    name: entry.jobId,
    good: entry.good,
    scrap: entry.scrap,
  }));

  const yieldData = summary.assigneeYield.filter(
    (entry) => entry.yieldPercent !== null
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Requested qty" value={summary.totalRequested} />
        <KpiCard label="Good parts" value={summary.totalGood} />
        <KpiCard label="Scrap parts" value={summary.totalScrap} />
        <KpiCard
          label="Yield"
          value={summary.yieldPercent !== null ? `${summary.yieldPercent}%` : "—"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Good vs scrap by job</CardTitle>
          </CardHeader>
          <CardContent>
            {partsData.length === 0 ? (
              <EmptyChart message="No parts data recorded." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={partsData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 4% 26%)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "hsl(240 5% 65%)", fontSize: 11 }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis allowDecimals={false} tick={{ fill: "hsl(240 5% 65%)", fontSize: 12 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="good" name="Good" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="scrap" name="Scrap" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Yield by assignee</CardTitle>
          </CardHeader>
          <CardContent>
            {yieldData.length === 0 ? (
              <EmptyChart message="No yield data yet." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={yieldData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 4% 26%)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "hsl(240 5% 65%)", fontSize: 12 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "hsl(240 5% 65%)", fontSize: 12 }}
                    unit="%"
                  />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="yieldPercent" name="Yield %" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {summary.progressJobs.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Progress-tracked jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.progressJobs.map((entry) => (
              <div key={entry.jobId}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{entry.jobId}</span>
                  <span className="text-muted-foreground">
                    {entry.assignee} · {entry.progress}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${entry.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function DashboardPanel({
  jobs,
  pipeline,
  loading,
  tab,
  onTabChange,
}: DashboardPanelProps) {
  if (loading) {
    return <DashboardLoading />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {DASHBOARD_TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onTabChange(entry.id)}
            className={cn(
              "rounded-full px-3.5 py-1 text-sm font-medium transition-colors",
              tab === entry.id
                ? "bg-secondary text-foreground"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <OverviewDashboard jobs={jobs} pipeline={pipeline} /> : null}
      {tab === "pipeline" ? <PipelineDashboard jobs={jobs} pipeline={pipeline} /> : null}
      {tab === "team" ? <TeamDashboard jobs={jobs} pipeline={pipeline} /> : null}
      {tab === "production" ? <ProductionDashboard jobs={jobs} /> : null}
    </div>
  );
}

export default DashboardPanel;
