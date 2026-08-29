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

// ── Parse cron day-of-week field ─────────────────────────
// Standard cron: "0 9 * * 1-5" means weekdays
// Field 5 = day of week (0=Sun, 1=Mon, ..., 6=Sat)
// Also handles: "30m", "2h", "daily" (every day)

function doesJobRunOnDay(schedule: string, dayOfWeek: number): boolean {
  const s = schedule.trim().toLowerCase();

  // Short format: "30m", "2h" → runs every day
  if (/\d+[mh]/.test(s)) return true;
  if (s.includes('daily') || s.includes('every day')) return true;

  const cronParts = s.split(/\s+/);
  if (cronParts.length < 5) return true; // assume every day if can't parse

  const dowPart = cronParts[4];
  if (dowPart === '*') return true;

  // Handle ranges: "1-5"
  const rangeMatch = dowPart.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    const end = parseInt(rangeMatch[2]);
    return dayOfWeek >= start && dayOfWeek <= end;
  }

  // Handle comma-separated: "1,3,5"
  const values = dowPart.split(',').map(v => parseInt(v.trim()));
  return values.includes(dayOfWeek);
}

// ── Calendar Component ──────────────────────────────────

interface CalendarProps {
  jobs: CronJob[];
  selectedDate: Date | null;
  onSelectDate: (date: Date | null) => void;
}

export function CronCalendar({ jobs, selectedDate, onSelectDate }: CalendarProps) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  // Build calendar grid
  const cells = useMemo(() => {
    const result: { day: number; date: Date; jobCount: number; isToday: boolean; isSelected: boolean }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < firstDayOfWeek; i++) {
      result.push({ day: 0, date: new Date(), jobCount: 0, isToday: false, isSelected: false }); // empty
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      date.setHours(0, 0, 0, 0);
      const dow = date.getDay();
      const jobCount = jobs.filter(j => doesJobRunOnDay(j.schedule, dow)).length;

      const isToday = date.getTime() === today.getTime();
      const isSelected = selectedDate ? date.getTime() === new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime() : false;

      result.push({ day: d, date, jobCount, isToday, isSelected });
    }

    return result;
  }, [year, month, daysInMonth, firstDayOfWeek, jobs, selectedDate]);

  const prevMonth = () => {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() - 1);
    setViewDate(d);
  };

  const nextMonth = () => {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() + 1);
    setViewDate(d);
  };

  const monthLabel = `${year}年${month + 1}月`;

  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 rounded hover:bg-muted text-muted-foreground">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium">{monthLabel}</span>
        <button onClick={nextMonth} className="p-1 rounded hover:bg-muted text-muted-foreground">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {weekDays.map(d => (
          <div key={d} className="text-center text-[10px] text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) => {
          if (cell.day === 0) return <div key={i} />;

          return (
            <button
              key={i}
              onClick={() => {
                if (cell.isSelected) {
                  onSelectDate(null); // deselect
                } else {
                  onSelectDate(cell.date);
                }
              }}
              className={cn(
                'relative flex flex-col items-center justify-center py-1.5 rounded-md text-xs transition-colors',
                cell.isSelected
                  ? 'bg-primary text-primary-foreground'
                  : cell.isToday
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-muted text-foreground',
              )}
            >
              <span className={cn('text-sm', cell.isSelected && 'font-bold')}>{cell.day}</span>
              {/* Job count indicator */}
              {cell.jobCount > 0 && (
                <span className={cn(
                  'text-[8px] leading-none mt-0.5',
                  cell.isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground',
                )}>
                  {cell.jobCount}个
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected date info */}
      {selectedDate && (
        <div className="mt-3 pt-2 border-t border-border text-[10px] text-muted-foreground text-center">
          {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 · {['周日', '周一', '周二', '周三', '周四', '周五', '周六'][selectedDate.getDay()]} · {jobs.filter(j => doesJobRunOnDay(j.schedule, selectedDate.getDay())).length}个任务
        </div>
      )}
    </div>
  );
}

// ── Export filter function ───────────────────────────────

export function filterJobsByDate(jobs: CronJob[], date: Date): CronJob[] {
  const dow = date.getDay();
  return jobs.filter(j => doesJobRunOnDay(j.schedule, dow));
}
