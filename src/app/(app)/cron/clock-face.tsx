'use client';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface CronJob {
  id: string;
  job_id: string;
  name: string;
  schedule: string;
  status: 'active' | 'paused';
}

// ── Parse schedule to frequency (times per day) ─────────

function getFrequency(schedule: string): number {
  const s = schedule.trim().toLowerCase();

  const minMatch = s.match(/(\d+)\s*m/);
  if (minMatch) return Math.floor(1440 / parseInt(minMatch[1]));

  const hourMatch = s.match(/(\d+)\s*h/);
  if (hourMatch) return Math.floor(24 / parseInt(hourMatch[1]));

  if (s.includes('daily') || s.includes('every day')) return 1;

  const cronParts = s.split(/\s+/);
  if (cronParts.length >= 2) {
    const hourPart = cronParts[1];
    if (hourPart === '*') return 24;
    const stepMatch = hourPart.match(/^\*\/(\d+)$/);
    if (stepMatch) return Math.floor(24 / parseInt(stepMatch[1]));
    return hourPart.split(',').length;
  }
  return 1;
}

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

  if (s.includes('daily') || s.includes('every day')) return [0];

  const cronParts = s.split(/\s+/);
  if (cronParts.length >= 2) {
    const minute = parseInt(cronParts[0]);
    const hourPart = cronParts[1];
    if (hourPart === '*') return Array.from({ length: 24 }, (_, i) => i + minute / 60);
    const stepMatch = hourPart.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[1]);
      const hours: number[] = [];
      for (let h = 0; h < 24; h += step) hours.push(h + minute / 60);
      return hours;
    }
    return hourPart.split(',').map(h => parseInt(h.trim())).filter(h => !isNaN(h));
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
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const option = useMemo(() => {
    const now = time;
    const hours = now.getHours() % 12;
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const hourAngle = (hours + minutes / 60) * 30;
    const minuteAngle = (minutes + seconds / 60) * 6;
    const secondAngle = seconds * 6;

    // Sort jobs by frequency: high freq → near center, low freq → near edge
    const sortedJobs = [...jobs].sort((a, b) => getFrequency(b.schedule) - getFrequency(a.schedule));
    const maxFreq = Math.max(...sortedJobs.map(j => getFrequency(j.schedule)), 1);
    const minFreq = Math.min(...sortedJobs.map(j => getFrequency(j.schedule)), 1);

    // Build task graphic elements
    const taskGraphics: any[] = [];
    sortedJobs.forEach((job, idx) => {
      const freq = getFrequency(job.schedule);
      // Map frequency to radius: high freq → small radius (near hands), low freq → large radius (near edge)
      // Range: 14 (just outside second hand) to 36 (inside hour markers)
      const radiusNorm = maxFreq === minFreq ? 0.5 : (freq - minFreq) / (maxFreq - minFreq);
      const radius = 14 + (1 - radiusNorm) * 22; // 14 (high freq) to 36 (low freq)

      const hoursList = parseScheduleHours(job.schedule);
      const isActive = job.status === 'active';
      const isSelected = (job.job_id || job.id) === selectedJobId;
      const color = isActive ? '#22c55e' : '#f59e0b';

      hoursList.forEach(h => {
        const angle = (((h % 24) / 12) * 360 - 90) * (Math.PI / 180);
        const x = 50 + radius * Math.cos(angle);
        const y = 50 + radius * Math.sin(angle);

        // Glow ring for selected
        if (isSelected) {
          taskGraphics.push({
            type: 'circle',
            shape: { cx: x, cy: y, r: 4.5 },
            style: { fill: 'transparent', stroke: '#3b82f6', lineWidth: 2 },
            z: 20,
          });
        }

        // Task dot
        taskGraphics.push({
          type: 'circle',
          shape: { cx: x, cy: y, r: isSelected ? 3 : 2.5 },
          style: {
            fill: color,
            shadowColor: isActive ? 'rgba(34,197,94,0.5)' : 'rgba(245,158,11,0.5)',
            shadowBlur: isSelected ? 8 : 3,
          },
          z: 21,
          // Store job info for tooltip
          jobName: job.name || job.job_id,
          jobSchedule: job.schedule,
          jobId: job.job_id || job.id,
        });
      });
    });

    // Hand calculations
    const hourLen = 22;
    const hourRad = ((hourAngle - 90) * Math.PI) / 180;
    const hourX = 50 + hourLen * Math.cos(hourRad);
    const hourY = 50 + hourLen * Math.sin(hourRad);

    const minLen = 32;
    const minRad = ((minuteAngle - 90) * Math.PI) / 180;
    const minX = 50 + minLen * Math.cos(minRad);
    const minY = 50 + minLen * Math.sin(minRad);

    const secLen = 38;
    const secRad = ((secondAngle - 90) * Math.PI) / 180;
    const secX = 50 + secLen * Math.cos(secRad);
    const secY = 50 + secLen * Math.sin(secRad);

    return {
      backgroundColor: 'transparent',
      graphic: [
        // ── Outer ring ──
        { type: 'circle', shape: { cx: 50, cy: 50, r: 50 }, style: { fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.15)', lineWidth: 2 }, z: 0 },
        { type: 'circle', shape: { cx: 50, cy: 50, r: 48 }, style: { fill: 'transparent', stroke: 'rgba(255,255,255,0.06)', lineWidth: 0.5 }, z: 0 },

        // ── Minute tick marks (60) ──
        ...Array.from({ length: 60 }, (_, i) => {
          const a = ((i * 6 - 90) * Math.PI) / 180;
          const isMajor = i % 5 === 0;
          const r1 = isMajor ? 44 : 46;
          const r2 = 48;
          return {
            type: 'line',
            shape: {
              x1: 50 + r1 * Math.cos(a), y1: 50 + r1 * Math.sin(a),
              x2: 50 + r2 * Math.cos(a), y2: 50 + r2 * Math.sin(a),
            },
            style: {
              stroke: isMajor ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.12)',
              lineWidth: isMajor ? 2 : 0.5,
              lineCap: 'round',
            },
            z: 1,
          };
        }),

        // ── Hour labels (1-12) ──
        ...Array.from({ length: 12 }, (_, i) => {
          const hour = i === 0 ? 12 : i;
          const a = ((i * 30 - 90) * Math.PI) / 180;
          const x = 50 + 41 * Math.cos(a);
          const y = 50 + 41 * Math.sin(a);
          return {
            type: 'text',
            style: {
              text: `${hour}`, x, y,
              fill: 'rgba(255,255,255,0.6)',
              font: 'bold 4px sans-serif',
              textAlign: 'center' as const,
              textVerticalAlign: 'middle' as const,
            },
            z: 2,
          };
        }),

        // ── Hour hand ──
        { type: 'line', shape: { x1: 50, y1: 50, x2: hourX, y2: hourY }, style: { stroke: '#e2e8f0', lineWidth: 3.5, lineCap: 'round' }, z: 30 },

        // ── Minute hand ──
        { type: 'line', shape: { x1: 50, y1: 50, x2: minX, y2: minY }, style: { stroke: '#94a3b8', lineWidth: 2, lineCap: 'round' }, z: 31 },

        // ── Second hand ──
        { type: 'line', shape: { x1: 50, y1: 50, x2: secX, y2: secY }, style: { stroke: '#ef4444', lineWidth: 1, lineCap: 'round' }, z: 32 },

        // ── Center dot ──
        { type: 'circle', shape: { cx: 50, cy: 50, r: 2.5 }, style: { fill: '#ef4444' }, z: 33 },

        // ── Digital time ──
        {
          type: 'text',
          style: {
            text: `${String(now.getHours()).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
            x: 50, y: 66,
            fill: 'rgba(255,255,255,0.5)',
            font: '4.5px monospace',
            textAlign: 'center' as const,
            textVerticalAlign: 'middle' as const,
          },
          z: 2,
        },

        // ── Task dots (on the clock face) ──
        ...taskGraphics,
      ],
      // No xAxis/yAxis needed — pure graphic mode
      tooltip: { show: false },
    };
  }, [time, jobs, selectedJobId]);

  // Handle click via mouse event on canvas
  const handleChartClick = (params: any) => {
    // graphic elements don't fire normal echarts click events easily,
    // so we use the chart's getZr() to detect clicks on graphic elements
  };

  const onChartReady = (chart: any) => {
    chart.getZr().on('click', (e: any) => {
      // Find which graphic element was clicked
      const offsetX = e.offsetX;
      const offsetY = e.offsetY;
      const width = chart.getWidth();
      const height = chart.getHeight();
      // Convert to our 0-100 coordinate space
      const x = (offsetX / width) * 100;
      const y = (offsetY / height) * 100;

      // Find nearest task dot
      let nearestJob: CronJob | null = null;
      let minDist = Infinity;

      jobs.forEach(job => {
        const freq = getFrequency(job.schedule);
        const maxFreq = Math.max(...jobs.map(j => getFrequency(j.schedule)), 1);
        const minFreq = Math.min(...jobs.map(j => getFrequency(j.schedule)), 1);
        const radiusNorm = maxFreq === minFreq ? 0.5 : (freq - minFreq) / (maxFreq - minFreq);
        const radius = 14 + (1 - radiusNorm) * 22;

        const hoursList = parseScheduleHours(job.schedule);
        hoursList.forEach(h => {
          const angle = (((h % 24) / 12) * 360 - 90) * (Math.PI / 180);
          const dx = 50 + radius * Math.cos(angle);
          const dy = 50 + radius * Math.sin(angle);
          const dist = Math.sqrt((x - dx) ** 2 + (y - dy) ** 2);
          if (dist < minDist && dist < 5) {
            minDist = dist;
            nearestJob = job;
          }
        });
      });

      if (nearestJob) {
        onSelectJob((nearestJob as CronJob).job_id || (nearestJob as CronJob).id);
      }
    });
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <ReactECharts
        option={option}
        style={{ width: 'min(90vw, 90vh)', height: 'min(90vw, 90vh)', maxWidth: 800, maxHeight: 800 }}
        opts={{ renderer: 'canvas' }}
        onChartReady={onChartReady}
        notMerge={false}
        lazyUpdate={true}
        autoResize={true}
      />
    </div>
  );
}
