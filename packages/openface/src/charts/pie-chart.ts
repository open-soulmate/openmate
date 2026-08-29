import type { EChartsOption } from 'echarts';
import { colors } from '../design-tokens';

export interface PieChartOpts {
  donut?: boolean;
  legend?: boolean;
  label?: boolean;
  roseType?: 'radius' | 'area';
  center?: [string, string];
}

export function buildPieOption(
  data: { name: string; value: number }[],
  opts?: PieChartOpts,
): EChartsOption {
  const palette = [colors.info, colors.success, colors.warning, colors.error, colors.primary, colors.mutedForeground];
  const innerRadius = opts?.donut ? ['40%', '70%'] : ['0%', '70%'];
  const center = opts?.center ?? ['50%', '55%'];

  return {
    color: palette,
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c} ({d}%)' },
    legend: opts?.legend !== false ? { bottom: 0, type: 'scroll' as const } : undefined,
    series: [{
      type: 'pie' as const,
      data,
      radius: innerRadius,
      center,
      roseType: opts?.roseType,
      label: {
        show: opts?.label ?? true,
        color: colors.mutedForeground,
        fontSize: 12,
      },
      labelLine: { lineStyle: { color: colors.border } },
      itemStyle: {
        borderColor: colors.background,
        borderWidth: 2,
        borderRadius: 6,
      },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' },
      },
    }],
  };
}
