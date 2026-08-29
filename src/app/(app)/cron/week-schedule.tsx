'use client';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CronJob {
  id: string;
  job_id: string;
  name: string;
  schedule: string;
  status: 'active' | 'paused';
}

// ── Parse schedule to hours array ────────────────────────

function parseScheduleHours(schedule: string): number[] {
  const s = schedule.trim().toLowerCase();

  const minMatch = s.match(/(\d+)\s*m/);
  if (minMatch) {
    const mins = parseInt(minMatch[1]);
    if (mins <= 60) return Array.from({ length: 24 }, (_, i) => i);
    return Array.from({ length: Math.ceil(1440 / mins) }, (_, i) => (i * mins / 60) % 24);
  }

  const hourMatch = s.match(/(\d+)\s*h/);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1]);
    return Array.from({ length: Math.ceil(24 / hours) }, (_, i) => (i * hours) % 24);
  }

  if (s.includes('daily') || s.includes('every day')) return Array.from({ length: 24 }, (_, i) => i);

  const cronParts = s.split(/\s+/);
  if (cronParts.length >= 2) {
    const minute = parseInt(cronParts[0]);
    const hourPart = cronParts[1];

    if (hourPart === '*') return Array.from({ length: 24 }, (_, i) => i);

    const stepMatch = hourPart.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[1]);
      const hours: number[] = [];
      for (let h = 0; h < 24; h += step) hours.push(h);
      return hours;
    }

    return hourPart.split(',').map(h => parseInt(h.trim())).filter(h => !isNaN(h));
  }

  return [];
}

function doesJobRunOnDay(schedule: string, dayOfWeek: number): boolean {
  const s = schedule.trim().toLowerCase();

  if (/\d+[mh]/.test(s)) return true;
  if (s.includes('daily') || s.includes('every day')) return true;

  const cronParts = s.split(/\s+/);
  if (cronParts.length < 5) return true;

  const dowPart = cronParts[4];
  if (dowPart === '*') return true;

  const rangeMatch = dowPart.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    const end = parseInt(rangeMatch[2]);
    return dayOfWeek >= start && dayOfWeek <= end;
  }

  const values = dowPart.split(',').map(v => parseInt(v.trim()));
  return values.includes(dayOfWeek);
}

// ── Week Schedule View ──────────────────────────────────

interface WeekScheduleProps {
  jobs: CronJob[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
}

export function WeekSchedule({ jobs, selectedJobId, onSelectJob }: WeekScheduleProps) {
  const [weekOffset, setWeekOffset] = useState(0);

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentDay = now.getDay(); // 0=Sun

  // Calculate week start (Monday)
  const weekStart = useMemo(() => {
    const d = new Date(now);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday
    d.setDate(d.getDate() + diff + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [weekOffset]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
  const isCurrentWeek = weekOffset === 0;

  // Build task grid: [dayIndex][hour] = jobs[]
  const grid = useMemo(() => {
    const g: CronJob[][][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => []));
    weekDays.forEach((date, dayIdx) => {
      const dow = date.getDay();
      jobs.forEach(job => {
        if (doesJobRunOnDay(job.schedule, dow)) {
          const hours = parseScheduleHours(job.schedule);
          hours.forEach(h => {
            const hour = Math.floor(h) % 24;
            g[dayIdx][hour].push(job);
          });
        }
      });
    });
    return g;
  }, [weekDays, jobs]);

  const weekLabel = `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 — ${weekDays[6].getMonth() + 1}月${weekDays[6].getDate()}日`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <span className="text-sm font-medium">{weekLabel}</span>
          {isCurrentWeek && <span className="ml-2 text-[10px] text-primary">本周</span>}
        </div>
        <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="flex border-b border-border shrink-0">
        <div className="w-12 shrink-0" /> {/* time column spacer */}
        {weekDays.map((date, i) => {
          const isToday = isCurrentWeek && date.getDay() === currentDay;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <div key={i} className={cn('flex-1 text-center py-2 border-l border-border', isToday && 'bg-primary/5')}>
              <div className="text-[10px] text-muted-foreground">{dayLabels[i]}</div>
              <div className={cn(
                'text-sm font-medium inline-flex items-center justify-center w-7 h-7 rounded-full',
                isToday ? 'bg-primary text-primary-foreground' : isWeekend ? 'text-muted-foreground' : '',
              )}>
                {date.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative">
          {Array.from({ length: 24 }, (_, hour) => (
            <div key={hour} className="flex" style={{ height: 48 }}>
              {/* Time label */}
              <div className="w-12 shrink-0 text-right pr-2 text-[10px] text-muted-foreground pt-0.5">
                {hour === 0 ? '00:00' : `${String(hour).padStart(2, '0')}:00`}
              </div>
              {/* Day cells */}
              {weekDays.map((date, dayIdx) => {
                const jobsInSlot = grid[dayIdx][hour];
                const isToday = isCurrentWeek && date.getDay() === currentDay;
                const isCurrentHour = isToday && hour === currentHour;

                return (
                  <div
                    key={dayIdx}
                    className={cn(
                      'flex-1 border-l border-b border-border relative',
                      isToday && 'bg-primary/[0.02]',
                    )}
                  >
                    {/* Current time line */}
                    {isCurrentHour && (
                      <div
                        className="absolute left-0 right-0 z-10 flex items-center"
                        style={{ top: `${(currentMinute / 60) * 100}%` }}
                      >
                        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                        <div className="flex-1 h-[1.5px] bg-red-500" />
                      </div>
                    )}

                    {/* Task blocks */}
                    {jobsInSlot.length > 0 && (
                      <div className="absolute inset-x-0.5 top-0.5 flex flex-col gap-0.5 overflow-hidden">
                        {jobsInSlot.slice(0, 3).map((job, j) => {
                          const isActive = job.status === 'active';
                          const isSelected = (job.job_id || job.id) === selectedJobId;
                          return (
                            <button
                              key={`${job.id}-${j}`}
                              onClick={() => onSelectJob(job.job_id || job.id)}
                              className={cn(
                                'w-full text-left px-1 py-0.5 rounded text-[9px] leading-tight truncate transition-all',
                                isActive
                                  ? 'bg-green-500/20 text-green-400 border-l-2 border-green-500'
                                  : 'bg-amber-500/20 text-amber-400 border-l-2 border-amber-500',
                                isSelected && 'ring-1 ring-primary bg-primary/20',
                              )}
                            >
                              {job.name || job.job_id?.slice(0, 6)}
                            </button>
                          );
                        })}
                        {jobsInSlot.length > 3 && (
                          <span className="text-[8px] text-muted-foreground px-1">
                            +{jobsInSlot.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
