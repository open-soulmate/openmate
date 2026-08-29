'use client';
import { useMemo } from 'react';
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
  const option = useMemo(() => {
    // Build scatter data: [hour, ringIndex, job]
    const seriesData: { value: number[]; itemStyle: { color: string; borderColor: string; borderWidth: number }; job: CronJob }[] = [];

    // Assign ring positions to avoid overlap
    const jobRingMap = new Map<string, number>();
    jobs.forEach((job, i) => {
      jobRingMap.set(job.id, i % 4); // 4 rings
    });

    jobs.forEach(job => {
      const hours = parseScheduleHours(job.schedule);
      const ring = jobRingMap.get(job.id) ?? 0;
      const radius = 0.55 + ring * 0.1; // 0.55, 0.65, 0.75, 0.85

      hours.forEach(h => {
        const isActive = job.status === 'active';
        const isSelected = (job.job_id || job.id) === selectedJobId;
        seriesData.push({
          value: [h % 24, radius],
          itemStyle: {
            color: isActive ? '#22c55e' : '#f59e0b',
            borderColor: isSelected ? '#3b82f6' : 'transparent',
            borderWidth: isSelected ? 3 : 0,
          },
          job,
        });
      });
    });

    return {
      polar: {},
      angleAxis: {
        type: 'value',
        min: 0,
        max: 24,
        clockwise: true,
        startAngle: 90, // 12 o'clock
        axisLine: { show: true, lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        axisTick: { show: true, interval: 1, lineStyle: { color: 'rgba(255,255,255,0.15)' } },
        axisLabel: {
          interval: 0,
          formatter: (val: number) => val % 1 === 0 ? `${val}` : '',
          fontSize: 11,
          color: 'rgba(255,255,255,0.5)',
        },
        splitLine: {
          show: true,
          lineStyle: { color: 'rgba(255,255,255,0.05)' },
        },
      },
      radiusAxis: {
        type: 'value',
        min: 0,
        max: 1,
        show: false,
      },
      series: [
        {
          type: 'scatter',
          coordinateSystem: 'polar',
          symbolSize: (val: number[]) => {
            const idx = seriesData.findIndex(d => d.value[0] === val[0] && d.value[1] === val[1]);
            if (idx >= 0 && (seriesData[idx].job.job_id || seriesData[idx].job.id) === selectedJobId) return 22;
            return 14;
          },
          data: seriesData,
          label: {
            show: false,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(59,130,246,0.5)',
            },
          },
        },
      ],
      tooltip: {
        trigger: 'item',
        formatter: (params: { data: { job: CronJob; value: number[] } }) => {
          const job = params.data.job;
          const hour = Math.floor(params.data.value[0]);
          const min = Math.round((params.data.value[0] % 1) * 60);
          return `<b>${job.name || job.job_id}</b><br/>Schedule: ${job.schedule}<br/>Time: ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}<br/>Status: ${job.status}`;
        },
        backgroundColor: 'rgba(0,0,0,0.8)',
        borderColor: 'transparent',
        textStyle: { color: '#fff', fontSize: 12 },
      },
    };
  }, [jobs, selectedJobId]);

  const handleClick = (params: { data: { job: CronJob } }) => {
    if (params.data?.job) {
      onSelectJob(params.data.job.job_id || params.data.job.id);
    }
  };

  return (
    <div className="flex items-center justify-center">
      <ReactECharts
        option={option}
        style={{ height: 400, width: 400 }}
        opts={{ renderer: 'svg' }}
        onEvents={{ click: handleClick }}
      />
    </div>
  );
}
