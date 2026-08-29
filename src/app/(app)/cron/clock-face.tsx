'use client';
import { useMemo } from 'react';

interface CronJob {
  id: string;
  job_id: string;
  name: string;
  schedule: string;
  status: 'active' | 'paused';
}

// ── Parse schedule to hours (0-24) ──────────────────────

function parseScheduleHours(schedule: string): number[] {
  const s = schedule.trim().toLowerCase();

  // "30m" / "every 30m" → every 30 minutes → plot at current hour
  const minMatch = s.match(/(\d+)\s*m/);
  if (minMatch) {
    const mins = parseInt(minMatch[1]);
    if (mins <= 60) return Array.from({ length: 24 }, (_, i) => i); // frequent → all hours
    return Array.from({ length: Math.ceil(1440 / mins) }, (_, i) => (i * mins / 60) % 24);
  }

  // "2h" / "every 2h" / "1h" / "every 1h"
  const hourMatch = s.match(/(\d+)\s*h/);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1]);
    return Array.from({ length: Math.ceil(24 / hours) }, (_, i) => (i * hours) % 24);
  }

  // "daily" / "every day" → 0:00
  if (s.includes('daily') || s.includes('every day')) return [0];

  // Standard cron: "0 9 * * *" or "30 14 * * *"
  const cronParts = s.split(/\s+/);
  if (cronParts.length >= 2) {
    const minute = parseInt(cronParts[0]);
    const hourPart = cronParts[1];

    if (hourPart === '*') {
      // Every hour at that minute
      return Array.from({ length: 24 }, (_, i) => i + minute / 60);
    }

    const hours: number[] = [];
    // Handle "*/N" pattern
    const stepMatch = hourPart.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[1]);
      for (let h = 0; h < 24; h += step) hours.push(h + minute / 60);
      return hours;
    }

    // Handle comma-separated: "9,14,21"
    const hourValues = hourPart.split(',').map(h => parseInt(h.trim())).filter(h => !isNaN(h));
    return hourValues.map(h => h + minute / 60);
  }

  // Fallback: try to find a number that looks like an hour
  const numMatch = s.match(/(\d{1,2})/);
  if (numMatch) {
    const h = parseInt(numMatch[1]);
    if (h >= 0 && h <= 23) return [h];
  }

  return [];
}

// ── Clock Face Component ────────────────────────────────

interface ClockFaceProps {
  jobs: CronJob[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
}

export function ClockFace({ jobs, selectedJobId, onSelectJob }: ClockFaceProps) {
  const size = 400;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 180;
  const innerR = 60;
  const dotAreaR = outerR - 30;
  const dotAreaInnerR = innerR + 20;

  // Parse all jobs into positioned dots
  const dots = useMemo(() => {
    const result: { x: number; y: number; job: CronJob; hour: number }[] = [];

    jobs.forEach(job => {
      const hours = parseScheduleHours(job.schedule);
      hours.forEach(h => {
        // Angle: 0h = top (12 o'clock), clockwise
        const angle = ((h / 24) * 360 - 90) * (Math.PI / 180);
        // Spread dots radially based on a hash of the job id to avoid overlap
        const hash = job.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const radialOffset = (hash % 100) / 100; // 0-1
        const r = dotAreaInnerR + radialOffset * (dotAreaR - dotAreaInnerR);

        result.push({
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
          job,
          hour: h % 24,
        });
      });
    });
    return result;
  }, [jobs]);

  // Hour tick marks
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const angle = ((i / 24) * 360 - 90) * (Math.PI / 180);
    const x1 = cx + (outerR - 5) * Math.cos(angle);
    const y1 = cy + (outerR - 5) * Math.sin(angle);
    const x2 = cx + outerR * Math.cos(angle);
    const y2 = cy + outerR * Math.sin(angle);
    const labelX = cx + (outerR + 14) * Math.cos(angle);
    const labelY = cy + (outerR + 14) * Math.sin(angle);
    const isMajor = i % 6 === 0;
    return { x1, y1, x2, y2, labelX, labelY, hour: i, isMajor };
  });

  return (
    <div className="flex items-center justify-center">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[400px] h-auto"
        style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.1))' }}
      >
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="hsl(var(--border))" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="2,4" />

        {/* Hour ticks */}
        {ticks.map(t => (
          <g key={t.hour}>
            <line
              x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={t.isMajor ? 2 : 0.8}
              opacity={t.isMajor ? 0.6 : 0.3}
            />
            <text
              x={t.labelX} y={t.labelY}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={t.isMajor ? 11 : 8}
              fill="hsl(var(--muted-foreground))"
              opacity={t.isMajor ? 0.8 : 0.4}
            >
              {t.hour === 0 ? '0' : t.hour}
            </text>
          </g>
        ))}

        {/* Job dots */}
        {dots.map((dot, i) => {
          const isActive = dot.job.status === 'active';
          const isSelected = (dot.job.job_id || dot.job.id) === selectedJobId;
          return (
            <g key={`${dot.job.id}-${i}`}>
              {/* Selection ring */}
              {isSelected && (
                <circle
                  cx={dot.x} cy={dot.y} r={10}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  opacity={0.8}
                />
              )}
              {/* Dot */}
              <circle
                cx={dot.x} cy={dot.y}
                r={isSelected ? 6 : 5}
                fill={isActive ? '#22c55e' : '#f59e0b'}
                stroke={isSelected ? 'hsl(var(--primary))' : 'transparent'}
                strokeWidth={isSelected ? 2 : 0}
                className="cursor-pointer transition-all hover:r-7"
                onClick={() => onSelectJob(dot.job.job_id || dot.job.id)}
              >
                <title>{dot.job.name || dot.job.job_id} — {dot.job.schedule}</title>
              </circle>
            </g>
          );
        })}

        {/* Center label */}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={12} fontWeight="bold" fill="hsl(var(--foreground))">
          {jobs.length}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
          tasks
        </text>
      </svg>
    </div>
  );
}
