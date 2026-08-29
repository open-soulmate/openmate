'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

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

    if (hourPart === '*') {
      return Array.from({ length: 24 }, (_, i) => i + minute / 60);
    }

    const stepMatch = hourPart.match(/^\*\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[1]);
      const hours: number[] = [];
      for (let h = 0; h < 24; h += step) hours.push(h + minute / 60);
      return hours;
    }

    const hourValues = hourPart.split(',').map(h => parseInt(h.trim())).filter(h => !isNaN(h));
    return hourValues.map(h => h + minute / 60);
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

  // Tick every second
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const option = useMemo(() => {
    const now = time;
    const hours = now.getHours() % 12;
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const hourAngle = (hours + minutes / 60) * 30; // 360/12
    const minuteAngle = (minutes + seconds / 60) * 6; // 360/60
    const secondAngle = seconds * 6;

    // Task dots
    const taskData: any[] = [];
    const jobRingMap = new Map<string, number>();
    jobs.forEach((job, i) => jobRingMap.set(job.id, i % 3));

    jobs.forEach(job => {
      const hoursList = parseScheduleHours(job.schedule);
      const ring = jobRingMap.get(job.id) ?? 0;
      // Rings at radius 38, 43, 48 (out of 50)
      const radius = 38 + ring * 5;

      hoursList.forEach(h => {
        const angle = ((h % 24) / 12) * 360 - 90; // map 24h to 360°, -90 to start at top
        const rad = (angle * Math.PI) / 180;
        const x = 50 + radius * Math.cos(rad);
        const y = 50 + radius * Math.sin(rad);
        const isActive = job.status === 'active';
        const isSelected = (job.job_id || job.id) === selectedJobId;
        taskData.push({
          value: [x, y],
          symbolSize: isSelected ? 20 : 14,
          itemStyle: {
            color: isActive ? '#22c55e' : '#f59e0b',
            borderColor: isSelected ? '#3b82f6' : 'transparent',
            borderWidth: isSelected ? 3 : 0,
            shadowColor: isActive ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)',
            shadowBlur: isSelected ? 12 : 4,
          },
          job,
        });
      });
    });

    // Hour hand points (from center)
    const hourLen = 22;
    const hourRad = ((hourAngle - 90) * Math.PI) / 180;
    const hourX = 50 + hourLen * Math.cos(hourRad);
    const hourY = 50 + hourLen * Math.sin(hourRad);

    // Minute hand
    const minLen = 32;
    const minRad = ((minuteAngle - 90) * Math.PI) / 180;
    const minX = 50 + minLen * Math.cos(minRad);
    const minY = 50 + minLen * Math.sin(minRad);

    // Second hand
    const secLen = 38;
    const secRad = ((secondAngle - 90) * Math.PI) / 180;
    const secX = 50 + secLen * Math.cos(secRad);
    const secY = 50 + secLen * Math.sin(secRad);

    return {
      backgroundColor: 'transparent',
      graphic: [
        // Outer circle
        { type: 'circle', shape: { cx: 50, cy: 50, r: 50 }, style: { fill: 'transparent', stroke: 'rgba(255,255,255,0.12)', lineWidth: 2 } },
        // Inner circle
        { type: 'circle', shape: { cx: 50, cy: 50, r: 48 }, style: { fill: 'transparent', stroke: 'rgba(255,255,255,0.06)', lineWidth: 1 } },
        // Task ring guides
        { type: 'circle', shape: { cx: 50, cy: 50, r: 38 }, style: { fill: 'transparent', stroke: 'rgba(255,255,255,0.04)', lineWidth: 0.5, lineDash: [2, 4] } },
        { type: 'circle', shape: { cx: 50, cy: 50, r: 43 }, style: { fill: 'transparent', stroke: 'rgba(255,255,255,0.04)', lineWidth: 0.5, lineDash: [2, 4] } },
        { type: 'circle', shape: { cx: 50, cy: 50, r: 48 }, style: { fill: 'transparent', stroke: 'rgba(255,255,255,0.04)', lineWidth: 0.5, lineDash: [2, 4] } },
        // Hour hand (thick)
        { type: 'line', shape: { x1: 50, y1: 50, x2: hourX, y2: hourY }, style: { stroke: '#e2e8f0', lineWidth: 3.5, lineCap: 'round' } },
        // Minute hand (medium)
        { type: 'line', shape: { x1: 50, y1: 50, x2: minX, y2: minY }, style: { stroke: '#94a3b8', lineWidth: 2, lineCap: 'round' } },
        // Second hand (thin, red)
        { type: 'line', shape: { x1: 50, y1: 50, x2: secX, y2: secY }, style: { stroke: '#ef4444', lineWidth: 1, lineCap: 'round' } },
        // Center dot
        { type: 'circle', shape: { cx: 50, cy: 50, r: 2 }, style: { fill: '#ef4444' } },
        // Hour markers
        ...Array.from({ length: 12 }, (_, i) => {
          const a = ((i * 30 - 90) * Math.PI) / 180;
          const x1 = 50 + 45 * Math.cos(a);
          const y1 = 50 + 45 * Math.sin(a);
          const x2 = 50 + 48 * Math.cos(a);
          const y2 = 50 + 48 * Math.sin(a);
          return { type: 'line', shape: { x1, y1, x2, y2 }, style: { stroke: 'rgba(255,255,255,0.4)', lineWidth: i % 3 === 0 ? 2.5 : 1.2, lineCap: 'round' } };
        }),
        // Hour labels
        ...Array.from({ length: 12 }, (_, i) => {
          const hour = i === 0 ? 12 : i;
          const a = ((i * 30 - 90) * Math.PI) / 180;
          const x = 50 + 41 * Math.cos(a);
          const y = 50 + 41 * Math.sin(a);
          return { type: 'text', style: { text: `${hour}`, x, y, fill: 'rgba(255,255,255,0.55)', font: 'bold 4px sans-serif', textAlign: 'center' as const, textVerticalAlign: 'middle' as const } };
        }),
        // Minute tick marks
        ...Array.from({ length: 60 }, (_, i) => {
          if (i % 5 === 0) return null; // skip hour positions
          const a = ((i * 6 - 90) * Math.PI) / 180;
          const x1 = 50 + 46 * Math.cos(a);
          const y1 = 50 + 46 * Math.sin(a);
          const x2 = 50 + 48 * Math.cos(a);
          const y2 = 50 + 48 * Math.sin(a);
          return { type: 'line', shape: { x1, y1, x2, y2 }, style: { stroke: 'rgba(255,255,255,0.1)', lineWidth: 0.5 } };
        }).filter(Boolean),
        // Digital time at bottom
        { type: 'text', style: { text: `${String(now.getHours()).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`, x: 50, y: 68, fill: 'rgba(255,255,255,0.6)', font: '5px monospace', textAlign: 'center' as const, textVerticalAlign: 'middle' as const } },
      ],
      xAxis: { show: false, min: 0, max: 100 },
      yAxis: { show: false, min: 0, max: 100 },
      series: [{
        type: 'scatter',
        data: taskData,
        coordinateSystem: 'cartesian2d',
        label: { show: false },
        emphasis: {
          itemStyle: { shadowBlur: 15, shadowColor: 'rgba(59,130,246,0.6)' },
        },
      }],
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          if (!params.data?.job) return '';
          const job = params.data.job;
          return `<b>${job.name || job.job_id}</b><br/>Schedule: ${job.schedule}<br/>Status: ${job.status}`;
        },
        backgroundColor: 'rgba(0,0,0,0.85)',
        borderColor: 'transparent',
        textStyle: { color: '#fff', fontSize: 12 },
      },
    };
  }, [time, jobs, selectedJobId]);

  const handleClick = (params: any) => {
    if (params.data?.job) {
      onSelectJob(params.data.job.job_id || params.data.job.id);
    }
  };

  return (
    <div className="flex-1 min-h-0 w-full flex items-center justify-center p-4">
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'canvas' }}
        onEvents={{ click: handleClick }}
        notMerge={false}
        lazyUpdate={true}
        autoResize={true}
      />
    </div>
  );
}
