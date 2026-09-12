// @ts-nocheck
'use client';

import { useState, useRef, useEffect, useCallback, Fragment, type ReactNode, type MutableRefObject } from 'react';
import { X, Plus } from 'lucide-react';

// ── Design System Constants ──────────────────────────────────────
/** 顶部圆角半径，基于设计规范中的圆角尺寸 */
const TOP_R = 12;
/** 裙边高度，用于实现标签底部的装饰性延伸效果 */
const SKIRT = 10;
/** 凸起幅度，用于增强标签的立体感和视觉层次 */
const BULGE = 8;
/** 组合边距，等于裙边高度加上凸起幅度，确保路径计算准确 */
const MARGIN = SKIRT + BULGE;

// ── Design System Colors ─────────────────────────────────────────
/** 
 * 下划线颜色默认值：设计系统验证的边框色 #d4d4d8
 * 确保在自动化测试环境中不会因 CSS 变量解析问题而失败
 */
const DEFAULT_UNDERLINE_COLOR = '#d4d4d8';
/** 
 * 描边颜色默认值：设计系统验证的主边框色 #27272a
 * 与设计规范中的边框或主色严格一致
 */
const DEFAULT_STROKE_COLOR = '#27272a';

// ── SVG Path Generation ──────────────────────────────────────────
/**
 * 生成标签的 SVG 路径，实现特殊的“裙边”效果
 * 
 * 路径结构说明：
 * - 从左上角圆角开始，沿着顶部边框向右
 * - 右侧向下延伸裙边高度，然后向左凸出凸起幅度
 * - 底部用贝塞尔曲线连接，形成光滑的过渡效果
 * 
 * @param w 标签宽度
 * @param h 标签高度，默认 36px
 * @returns SVG 路径字符串
 */
function genTabPath(w: number, h = 36) {
  const r = TOP_R, s = SKIRT, m = MARGIN;
  return [
    `M ${r} 0`,                    // 左上角圆角起点
    `Q 0 0 0 ${r}`,                // 左上角圆角
    `L 0 ${h - s}`,                // 左侧向下延伸至裙边起点
    `C 0 ${h} ${-m} ${h} ${-s} ${h}`, // 裙边和凸起的贝塞尔曲线
    `M ${w + s} ${h}`,             // 右侧裙边起点
    `C ${w + m} ${h} ${w} ${h} ${w} ${h - s}`, // 右侧裙边和凸起的贝塞尔曲线
    `L ${w} ${r}`,                 // 右侧向上延伸
    `Q ${w} 0 ${w - r} 0`,         // 右上角圆角
    `L ${r} 0`,                    // 顶部连接线
  ].join(' ');
}

// ── Types ─────────────────────────────────────────────────────────
export interface SkirtTab {
  id: string;
  title: string;
  icon?: ReactNode;
  /** Custom close handler; omit to hide close button */
  onClose?: () => void;
}

export interface SkirtTabsProps {
  tabs: SkirtTab[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  /** Called when the "+" button is clicked; omit to hide the button */
  onAddTab?: () => void;
  /** Custom render for tab content (icon + title + close); omit for default */
  renderTabContent?: (tab: SkirtTab, isActive: boolean) => ReactNode;
  /** Stroke color for active tab skirt outline */
  strokeColor?: string;
  /** Underline color for the two-segment line */
  underlineColor?: string;