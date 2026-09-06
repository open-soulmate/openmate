"use client";

/**
 * 小米 Alive 超椭圆组件
 * 公式：|x/a|^n + |y/b|^n = 1，n=3，a=b（正方形）
 */
import { useMemo, type ReactNode } from "react";

interface SuperEllipseProps {
  /** 尺寸（px），正方形边长 */
  size?: number;
  /** 背景色 */
  fill?: string;
  /** 子元素 */
  children?: ReactNode;
  /** 额外 class */
  className?: string;
  /** 点击事件 */
  onClick?: () => void;
}

/** 生成 n=3 超椭圆 SVG path */
function genPath(r: number, n = 3, segments = 72): string {
  const pts: string[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const x = r + r * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n);
    const y = r + r * Math.sign(st) * Math.pow(Math.abs(st), 2 / n);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
}

export function SuperEllipse({
  size = 40,
  fill = "transparent",
  children,
  className,
  onClick,
}: SuperEllipseProps) {
  const r = size / 2;
  const d = useMemo(() => genPath(r), [r]);

  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {/* 超椭圆背景 */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <path d={d} fill={fill} />
      </svg>
      {/* 内容层 */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
