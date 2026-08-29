'use client';
import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { assembleECharts } from 'flint-chart';
import { TrendingUp, BarChart3, Calendar, PieChart } from 'lucide-react';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface Course {
  id: string;
  title: string;
  tags: string[];
  totalChapters: number;
  completedChapters: number;
  status: string;
  updatedAt: number;
  chapters?: { id: string; title: string; completed: boolean; completedAt: number | null }[];
}

// ── 学习曲线：按日期累计完成章节 ───────────────────────

function LearningCurve({ courses }: { courses: Course[] }) {
  const option = useMemo(() => {
    const dateMap = new Map<string, number>();
    courses.flatMap(c => c.chapters ?? [])
      .filter(ch => ch.completed && ch.completedAt)
      .forEach(ch => {
        const key = new Date(ch.completedAt! * 1000).toISOString().slice(0, 10);
        dateMap.set(key, (dateMap.get(key) ?? 0) + 1);
      });

    const dates: string[] = [];
    const daily: number[] = [];
    const cumulative: number[] = [];
    let total = 0;
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dates.push(key.slice(5)); // MM-DD
      const count = dateMap.get(key) ?? 0;
      daily.push(count);
      total += count;
      cumulative.push(total);
    }

    const result = assembleECharts({
      data: { values: dates.map((d, i) => ({ date: d, cumulative: cumulative[i], daily: daily[i] })) },
      semantic_types: { date: 'Temporal', cumulative: 'Quantity', daily: 'Quantity' },
      chart_spec: {
        chartType: 'Area Chart',
        encodings: {
          x: { field: 'date' },
          y: { field: 'cumulative' },
        },
        canvasSize: { width: 500, height: 200 },
      },
    });
    return result;
  }, [courses]);

  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-primary" />
        <h4 className="text-xs font-medium">学习曲线（30天）</h4>
      </div>
      <ReactECharts option={option as any} style={{ height: 200 }} opts={{ renderer: 'svg' }} />
    </div>
  );
}

// ── 课程完成率对比 ─────────────────────────────────────

function CourseComparison({ courses }: { courses: Course[] }) {
  const option = useMemo(() => {
    const values = courses.map(c => ({
      course: c.title.length > 10 ? c.title.slice(0, 10) + '…' : c.title,
      completion: c.totalChapters > 0 ? Math.round((c.completedChapters / c.totalChapters) * 100) : 0,
    }));

    return assembleECharts({
      data: { values },
      semantic_types: { course: 'Nominal', completion: 'Percentage' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: {
          x: { field: 'course' },
          y: { field: 'completion' },
        },
        canvasSize: { width: 500, height: 200 },
      },
    });
  }, [courses]);

  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={14} className="text-blue-500" />
        <h4 className="text-xs font-medium">课程完成率对比</h4>
      </div>
      <ReactECharts option={option as any} style={{ height: 200 }} opts={{ renderer: 'svg' }} />
    </div>
  );
}

// ── 学习热力图 ────────────────────────────────────────

function LearningHeatmap({ courses }: { courses: Course[] }) {
  const option = useMemo(() => {
    const dateMap = new Map<string, number>();
    courses.flatMap(c => c.chapters ?? [])
      .filter(ch => ch.completed && ch.completedAt)
      .forEach(ch => {
        const key = new Date(ch.completedAt! * 1000).toISOString().slice(0, 10);
        dateMap.set(key, (dateMap.get(key) ?? 0) + 1);
      });

    const values: { date: string; count: number }[] = [];
    const today = new Date();
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      values.push({ date: key, count: dateMap.get(key) ?? 0 });
    }

    return assembleECharts({
      data: { values },
      semantic_types: { date: 'Temporal', count: 'Quantity' },
      chart_spec: {
        chartType: 'Calendar Heatmap',
        encodings: {
          x: { field: 'date' },
          y: { field: 'count' },
        },
        canvasSize: { width: 500, height: 120 },
      },
    });
  }, [courses]);

  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar size={14} className="text-green-500" />
        <h4 className="text-xs font-medium">学习热力图（90天）</h4>
      </div>
      <ReactECharts option={option as any} style={{ height: 120 }} opts={{ renderer: 'svg' }} />
    </div>
  );
}

// ── 状态分布饼图 ──────────────────────────────────────

function StatusPie({ courses }: { courses: Course[] }) {
  const option = useMemo(() => {
    const statusMap = new Map<string, number>();
    courses.forEach(c => {
      const label = c.status === 'not_started' ? '未开始' : c.status === 'in_progress' ? '进行中' : c.status === 'reviewing' ? '复习中' : '已完成';
      statusMap.set(label, (statusMap.get(label) ?? 0) + 1);
    });
    const values = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

    return assembleECharts({
      data: { values },
      semantic_types: { status: 'Nominal', count: 'Quantity' },
      chart_spec: {
        chartType: 'Donut Chart',
        encodings: {
          x: { field: 'status' },
          y: { field: 'count' },
        },
        canvasSize: { width: 300, height: 200 },
      },
    });
  }, [courses]);

  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      <div className="flex items-center gap-2 mb-3">
        <PieChart size={14} className="text-amber-500" />
        <h4 className="text-xs font-medium">课程状态分布</h4>
      </div>
      <ReactECharts option={option as any} style={{ height: 200 }} opts={{ renderer: 'svg' }} />
    </div>
  );
}

// ── Main Export ────────────────────────────────────────

export function LearningCharts({ courses }: { courses: Course[] }) {
  if (courses.length === 0) return null;

  return (
    <div className="space-y-3 lg:space-y-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        学习动态
      </h3>
      <div className="grid gap-3 lg:gap-4 lg:grid-cols-2">
        <LearningCurve courses={courses} />
        <CourseComparison courses={courses} />
        <LearningHeatmap courses={courses} />
        <StatusPie courses={courses} />
      </div>
    </div>
  );
}
