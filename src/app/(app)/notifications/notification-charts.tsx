'use client';
import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { assembleECharts } from 'flint-chart';
import { PieChart, TrendingUp, BarChart3, Layers } from 'lucide-react';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface Notification {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  read: boolean;
  created_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  info: '#60a5fa',
  warning: '#fbbf24',
  error: '#f87171',
  success: '#4ade80',
};

const SEVERITY_LABELS: Record<string, string> = {
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
  success: 'Success',
};

// ── Severity Distribution (Pie/Donut) ─────────────────────

function SeverityPie({ notifications }: { notifications: Notification[] }) {
  const option = useMemo(() => {
    const countMap = new Map<string, number>();
    notifications.forEach(n => {
      const label = SEVERITY_LABELS[n.severity] || n.severity;
      countMap.set(label, (countMap.get(label) ?? 0) + 1);
    });
    const values = Array.from(countMap.entries()).map(([type, count]) => ({ type, count }));

    return assembleECharts({
      data: { values },
      semantic_types: { type: 'Nominal', count: 'Quantity' },
      chart_spec: {
        chartType: 'Pie Chart',
        encodings: {
          x: { field: 'type' },
          y: { field: 'count' },
        },
        chartProperties: { innerRadius: 35 },
        canvasSize: { width: 300, height: 200 },
      },
    });
  }, [notifications]);

  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      <div className="flex items-center gap-2 mb-3">
        <PieChart size={14} className="text-amber-500" />
        <h4 className="text-xs font-medium">Type Distribution</h4>
      </div>
      <ReactECharts option={option as any} style={{ height: 200 }} opts={{ renderer: 'svg' }} />
    </div>
  );
}

// ── Notification Timeline (Area Chart, 7 days) ────────────

function NotificationTimeline({ notifications }: { notifications: Notification[] }) {
  const option = useMemo(() => {
    const dateMap = new Map<string, number>();
    notifications.forEach(n => {
      const key = new Date(n.created_at).toISOString().slice(0, 10);
      dateMap.set(key, (dateMap.get(key) ?? 0) + 1);
    });

    const dates: string[] = [];
    const counts: number[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dates.push(key.slice(5)); // MM-DD
      counts.push(dateMap.get(key) ?? 0);
    }

    return assembleECharts({
      data: { values: dates.map((d, i) => ({ date: d, count: counts[i] })) },
      semantic_types: { date: 'Temporal', count: 'Quantity' },
      chart_spec: {
        chartType: 'Area Chart',
        encodings: {
          x: { field: 'date' },
          y: { field: 'count' },
        },
        canvasSize: { width: 500, height: 200 },
      },
    });
  }, [notifications]);

  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-primary" />
        <h4 className="text-xs font-medium">Timeline (7 days)</h4>
      </div>
      <ReactECharts option={option as any} style={{ height: 200 }} opts={{ renderer: 'svg' }} />
    </div>
  );
}

// ── Priority Distribution (Bar Chart) ─────────────────────

function PriorityBar({ notifications }: { notifications: Notification[] }) {
  const option = useMemo(() => {
    const priorityOrder = ['error', 'warning', 'info', 'success'];
    const countMap = new Map<string, number>();
    priorityOrder.forEach(p => countMap.set(p, 0));
    notifications.forEach(n => {
      countMap.set(n.severity, (countMap.get(n.severity) ?? 0) + 1);
    });
    const values = priorityOrder.map(p => ({
      priority: SEVERITY_LABELS[p] || p,
      count: countMap.get(p) ?? 0,
    }));

    return assembleECharts({
      data: { values },
      semantic_types: { priority: 'Nominal', count: 'Quantity' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: {
          x: { field: 'priority' },
          y: { field: 'count' },
        },
        canvasSize: { width: 500, height: 200 },
      },
    });
  }, [notifications]);

  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={14} className="text-blue-500" />
        <h4 className="text-xs font-medium">Priority Distribution</h4>
      </div>
      <ReactECharts option={option as any} style={{ height: 200 }} opts={{ renderer: 'svg' }} />
    </div>
  );
}

// ── Source Distribution (Horizontal Bar) ──────────────────

function SourceBar({ notifications }: { notifications: Notification[] }) {
  const option = useMemo(() => {
    // Derive source from title prefix (e.g., "System: ...", "Agent: ...")
    // or group by first word of title as a proxy for source
    const sourceMap = new Map<string, number>();
    notifications.forEach(n => {
      let source = 'Unknown';
      const title = n.title || '';
      const colonIdx = title.indexOf(':');
      if (colonIdx > 0 && colonIdx < 20) {
        source = title.slice(0, colonIdx).trim();
      } else {
        // Use first word as source
        const words = title.split(/\s+/);
        source = words[0]?.slice(0, 15) || 'Unknown';
      }
      sourceMap.set(source, (sourceMap.get(source) ?? 0) + 1);
    });

    // Sort by count descending, take top 8
    const sorted = Array.from(sourceMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const values = sorted.map(([source, count]) => ({ source, count }));

    return assembleECharts({
      data: { values },
      semantic_types: { source: 'Nominal', count: 'Quantity' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: {
          x: { field: 'count' },
          y: { field: 'source' },
        },
        canvasSize: { width: 500, height: 200 },
      },
    });
  }, [notifications]);

  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      <div className="flex items-center gap-2 mb-3">
        <Layers size={14} className="text-green-500" />
        <h4 className="text-xs font-medium">Source Distribution</h4>
      </div>
      <ReactECharts option={option as any} style={{ height: 200 }} opts={{ renderer: 'svg' }} />
    </div>
  );
}

// ── Main Export ────────────────────────────────────────

export function NotificationCharts({ notifications }: { notifications: Notification[] }) {
  if (notifications.length === 0) return null;

  return (
    <div className="space-y-3 lg:space-y-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Dashboard
      </h3>
      <div className="grid gap-3 lg:gap-4 grid-cols-1 lg:grid-cols-2">
        <SeverityPie notifications={notifications} />
        <NotificationTimeline notifications={notifications} />
        <PriorityBar notifications={notifications} />
        <SourceBar notifications={notifications} />
      </div>
    </div>
  );
}
