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

// ── Shared helpers ──────────────────────────────────────

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

// ── Year View ───────────────────────────────────────────

export function YearView({ jobs }: { jobs: CronJob[] }) {
  const year = new Date().getFullYear();
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  return (
    <div className="py-4">
      <h3 className="text-lg font-semibold mb-4 text-center">{year}年</h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 lg:gap-4">
        {monthNames.map((name, mi) => (
          <MiniMonth key={mi} year={year} month={mi} jobs={jobs} />
        ))}
      </div>
    </div>
  );
}

function MiniMonth({ year, month, jobs }: { year: number; month: number; jobs: CronJob[] }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const cells = useMemo(() => {
    const result: { day: number; hasJobs: boolean; isToday: boolean }[] = [];
    for (let i = 0; i < firstDow; i++) result.push({ day: 0, hasJobs: false, isToday: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dow = date.getDay();
      const hasJobs = jobs.some(j => doesJobRunOnDay(j.schedule, dow));
      const isToday = isCurrentMonth && d === today.getDate();
      result.push({ day: d, hasJobs, isToday });
    }
    return result;
  }, [year, month, daysInMonth, firstDow, jobs, isCurrentMonth, today]);

  const jobDaysCount = cells.filter(c => c.day > 0 && c.hasJobs).length;

  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="text-xs font-medium mb-2 flex items-center justify-between">
        <span>{month + 1}月</span>
        <span className="text-[9px] text-muted-foreground">{jobDaysCount}天有任务</span>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {['一', '二', '三', '四', '五', '六', '日'].map(d => (
          <div key={d} className="text-center text-[7px] text-muted-foreground">{d}</div>
        ))}
        {cells.map((c, i) => (
          <div key={i} className={cn(
            'text-center text-[9px] py-0.5 rounded-sm',
            c.isToday ? 'bg-primary text-primary-foreground font-bold' : '',
            c.hasJobs && !c.isToday ? 'text-foreground font-medium' : '',
            !c.hasJobs && !c.isToday && c.day > 0 ? 'text-muted-foreground/40' : '',
          )}>
            {c.day > 0 ? c.day : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Month View ──────────────────────────────────────────

interface MonthViewProps {
  jobs: CronJob[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
}

export function MonthView({ jobs, selectedJobId, onSelectJob }: MonthViewProps) {
  const now = new Date();
  const [viewDate, setViewDate] = useState(now);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const weekDayLabels = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="p-1.5 rounded hover:bg-muted">
          <ChevronLeft size={16} />
        </button>
        <span className="text-base font-semibold">{year}年{month + 1}月</span>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="p-1.5 rounded hover:bg-muted">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {weekDayLabels.map(d => (
          <div key={d} className="text-center text-xs text-muted-foreground py-2 font-medium">{d}</div>
        ))}
        {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1;
          const date = new Date(year, month, d);
          const dow = date.getDay();
          const dayJobs = jobs.filter(j => doesJobRunOnDay(j.schedule, dow));
          const isToday = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();

          return (
            <div
              key={d}
              className={cn(
                'min-h-[60px] rounded-lg border border-border p-1.5 transition-colors',
                isToday ? 'border-primary/40 bg-primary/5' : 'bg-card hover:border-primary/20',
              )}
            >
              <div className={cn(
                'text-xs font-medium mb-1',
                isToday ? 'text-primary' : 'text-foreground',
              )}>
                {d}
              </div>
              {dayJobs.slice(0, 3).map((job, j) => {
                const isActive = job.status === 'active';
                const isSelected = (job.job_id || job.id) === selectedJobId;
                return (
                  <button
                    key={`${job.id}-${j}`}
                    onClick={() => onSelectJob(job.job_id || job.id)}
                    className={cn(
                      'w-full text-left px-1 py-0.5 rounded text-[9px] truncate mb-0.5 transition-colors',
                      isActive ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400',
                      isSelected && 'ring-1 ring-primary',
                    )}
                  >
                    {job.name || job.job_id?.slice(0, 6)}
                  </button>
                );
              })}
              {dayJobs.length > 3 && (
                <span className="text-[8px] text-muted-foreground">+{dayJobs.length - 3}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Day View ────────────────────────────────────────────

interface DayViewProps {
  jobs: CronJob[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
}

export function DayView({ jobs, selectedJobId, onSelectJob }: DayViewProps) {
  const now = new Date();
  const [viewDate, setViewDate] = useState(now);
  const dow = viewDate.getDay();
  const dayJobs = jobs.filter(j => doesJobRunOnDay(j.schedule, dow));
  const isToday = viewDate.toDateString() === now.toDateString();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  // Build hour→jobs map
  const hourMap = useMemo(() => {
    const m = new Map<number, CronJob[]>();
    dayJobs.forEach(job => {
      const hours = parseScheduleHours(job.schedule);
      hours.forEach(h => {
        const hour = Math.floor(h) % 24;
        if (!m.has(hour)) m.set(hour, []);
        m.get(hour)!.push(job);
      });
    });
    return m;
  }, [dayJobs]);

  return (
    <div className="h-full flex flex-col">
      {/* Day header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <button onClick={() => { const d = new Date(viewDate); d.setDate(d.getDate() - 1); setViewDate(d); }} className="p-1.5 rounded hover:bg-muted">
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <span className="text-base font-semibold">{viewDate.getMonth() + 1}月{viewDate.getDate()}日</span>
          <span className="ml-2 text-sm text-muted-foreground">{dayLabels[dow]}</span>
          {isToday && <span className="ml-2 text-xs text-primary">今天</span>}
          <div className="text-xs text-muted-foreground mt-0.5">{dayJobs.length}个任务</div>
        </div>
        <button onClick={() => { const d = new Date(viewDate); d.setDate(d.getDate() + 1); setViewDate(d); }} className="p-1.5 rounded hover:bg-muted">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Time axis */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative">
          {Array.from(hourMap.entries()).sort(([a],[b]) => a - b).map(([hour, hJobs]) => {
            const jobsInHour = hJobs;
            const isCurrentHour = isToday && hour === currentHour;

            return (
              <div key={hour} className="flex" style={{ height: 56 }}>
                <div className="w-14 shrink-0 text-right pr-3 text-[11px] text-muted-foreground pt-1">
                  {String(hour).padStart(2, '0')}:00
                </div>
                <div className="flex-1 border-b border-l border-border relative px-2 py-1">
                  {/* Current time */}
                  {isCurrentHour && (
                    <div className="absolute left-0 right-0 z-10 flex items-center" style={{ top: `${(currentMinute / 60) * 100}%` }}>
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1" />
                      <div className="flex-1 h-[2px] bg-red-500" />
                      <span className="text-[9px] text-red-500 ml-1 font-mono">
                        {String(currentHour).padStart(2, '0')}:{String(currentMinute).padStart(2, '0')}
                      </span>
                    </div>
                  )}

                  {/* Task blocks */}
                  {jobsInHour.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {jobsInHour.map((job, j) => {
                        const isActive = job.status === 'active';
                        const isSelected = (job.job_id || job.id) === selectedJobId;
                        return (
                          <button
                            key={`${job.id}-${j}`}
                            onClick={() => onSelectJob(job.job_id || job.id)}
                            className={cn(
                              'w-full text-left px-2 py-1.5 rounded-md text-xs transition-all',
                              isActive
                                ? 'bg-green-500/15 border-l-3 border-green-500 text-green-400'
                                : 'bg-amber-500/15 border-l-3 border-amber-500 text-amber-400',
                              isSelected && 'ring-1 ring-primary bg-primary/15',
                            )}
                          >
                            <span className="font-medium">{job.name || job.job_id?.slice(0, 8)}</span>
                            <span className="ml-2 text-[10px] opacity-60">{job.schedule}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
