'use client';

/**
 * CAD 图纸渲染器（基于 @mlightcad/libredwg-web 的 convert() + Canvas 2D）
 *
 * 核心策略：用库的 convert() 将 DWG/DXF 解析为 DwgDatabase，遍历实体数组，
 * 用 Canvas 2D API 逐个绘制。比 SVG 方案更轻量、可控、性能更好。
 *
 * 流程：DWG/DXF 二进制 → dwg_read_data() → convert() → DwgDatabase → 遍历 entities → Canvas 绘制
 *
 * 坐标系说明：
 * - CAD 坐标系：Y 轴向上
 * - Canvas 坐标系：Y 轴向下
 * - 绘制时用 ctx.scale(1, -1) 翻转 Y 轴，文字再翻转回来
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut,
  AlertTriangle, Loader2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  类型（从 @mlightcad/libredwg-web 导入，避免运行时依赖）            */
/* ------------------------------------------------------------------ */

interface DwgPoint2D { x: number; y: number; }
interface DwgPoint3D { x: number; y: number; z: number; }

interface DwgEntityBase {
  type: string;
  layer: string;
  color?: number;
  colorIndex?: number;
  isVisible?: boolean;
}

interface DwgLineEntity extends DwgEntityBase {
  type: 'LINE';
  startPoint: DwgPoint3D;
  endPoint: DwgPoint3D;
}

interface DwgCircleEntity extends DwgEntityBase {
  type: 'CIRCLE';
  center: DwgPoint3D;
  radius: number;
}

interface DwgArcEntity extends DwgEntityBase {
  type: 'ARC';
  center: DwgPoint3D;
  radius: number;
  startAngle: number; // degrees
  endAngle: number;
}

interface DwgEllipseEntity extends DwgEntityBase {
  type: 'ELLIPSE';
  center: DwgPoint3D;
  majorAxisEndPoint: DwgPoint3D;
  axisRatio: number;
  startAngle: number; // radians
  endAngle: number;   // radians
}

interface DwgPointEntity extends DwgEntityBase {
  type: 'POINT';
  position: DwgPoint3D;
}

interface DwgLWPolylineVertex extends DwgPoint2D {
  bulge: number;
  startWidth?: number;
  endWidth?: number;
}

interface DwgLWPolylineEntity extends DwgEntityBase {
  type: 'LWPOLYLINE';
  vertices: DwgLWPolylineVertex[];
  flag: number;
}

interface DwgPolyline2dEntity extends DwgEntityBase {
  type: 'POLYLINE2D';
  vertices: { x: number; y: number; z: number }[];
  flag: number;
}

interface DwgPolyline3dEntity extends DwgEntityBase {
  type: 'POLYLINE3D';
  vertices: { x: number; y: number; z: number }[];
  flag: number;
}

interface DwgTextEntity extends DwgEntityBase {
  type: 'TEXT';
  text: string;
  startPoint: DwgPoint2D;
  textHeight: number;
  rotation: number;
  xScale: number;
}

interface DwgMTextEntity extends DwgEntityBase {
  type: 'MTEXT';
  text: string;
  insertionPoint: DwgPoint3D;
  textHeight: number;
  rectWidth: number;
  rotation: number;
}

interface DwgSplineEntity extends DwgEntityBase {
  type: 'SPLINE';
  controlPoints: DwgPoint3D[];
  fitPoints: DwgPoint3D[];
  knots: number[];
  degree: number;
}

interface DwgInsertEntity extends DwgEntityBase {
  type: 'INSERT';
  name: string;
  insertionPoint: DwgPoint3D;
  xScale: number;
  yScale: number;
  rotation: number;
}

interface DwgSolidEntity extends DwgEntityBase {
  type: 'SOLID';
  corner1: DwgPoint2D;
  corner2: DwgPoint2D;
  corner3: DwgPoint2D;
  corner4?: DwgPoint2D;
}

interface DwgRayEntity extends DwgEntityBase {
  type: 'RAY';
  firstPoint: DwgPoint3D;
  unitDirection: DwgPoint3D;
}

interface DwgXlineEntity extends DwgEntityBase {
  type: 'XLINE';
  firstPoint: DwgPoint3D;
  unitDirection: DwgPoint3D;
}

interface DwgHatchBoundaryPath {
  boundaryPathTypeFlag?: number;
  vertices?: (DwgPoint2D & { bulge?: number })[];
  edges?: Array<{
    type: number;
    start?: DwgPoint2D;
    end?: DwgPoint2D;
    center?: DwgPoint2D;
    radius?: number;
    startAngle?: number;
    endAngle?: number;
    isCCW?: boolean;
  }>;
}

interface DwgHatchEntity extends DwgEntityBase {
  type: 'HATCH';
  solidFill: number;
  boundaryPaths: DwgHatchBoundaryPath[];
  patternName: string;
  color?: number;
  colorIndex?: number;
}

interface DwgDimensionEntity extends DwgEntityBase {
  type: 'DIMENSION';
  definitionPoint: DwgPoint3D;
  textPoint: DwgPoint2D;
  text?: string;
  measurement?: number;
  subDefinitionPoint1?: DwgPoint3D;
  subDefinitionPoint2?: DwgPoint3D;
}

type DwgEntity =
  | DwgLineEntity
  | DwgCircleEntity
  | DwgArcEntity
  | DwgEllipseEntity
  | DwgPointEntity
  | DwgLWPolylineEntity
  | DwgPolyline2dEntity
  | DwgPolyline3dEntity
  | DwgTextEntity
  | DwgMTextEntity
  | DwgSplineEntity
  | DwgInsertEntity
  | DwgSolidEntity
  | DwgRayEntity
  | DwgXlineEntity
  | DwgHatchEntity
  | DwgDimensionEntity
  | DwgEntityBase;

interface DwgDatabase {
  entities: DwgEntity[];
  header?: Record<string, unknown>;
  tables?: {
    BLOCK_RECORD?: {
      entries: Array<{
        name: string;
        entities: DwgEntity[];
        basePoint?: { x: number; y: number; z: number };
      }>;
    };
    LAYER?: {
      entries: Array<{
        name: string;
        color?: { index: number };
        isOff?: boolean;
        isFrozen?: boolean;
      }>;
    };
    [key: string]: unknown;
  };
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface CadRendererProps {
  fileName: string;
  fileUrl?: string;
  fileBuffer?: ArrayBuffer;
  onError?: (err: Error) => void;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  ACI（AutoCAD Color Index）调色板                                   */
/* ------------------------------------------------------------------ */

const ACI_COLORS: readonly string[] = [
  '#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff',
  '#0000ff', '#ff00ff', '#ffffff', '#808080', '#c0c0c0',
  '#ff7f7f', '#ff7fbf', '#ff7fff', '#bf7fff', '#7f7fff',
  '#7fbfff', '#7fffff', '#7fffbf', '#7fff7f', '#bfff7f',
  '#ffff7f', '#ffbf7f', '#ff7f00', '#ff9f00', '#ffbf00',
  '#ffdf00', '#ffff00', '#dfff00', '#bfff00', '#9fff00',
  '#7fff00', '#00ff00', '#00ff3f', '#00ff7f', '#00ffbf',
  '#00ffff', '#00bfff', '#007fff', '#003fff', '#0000ff',
  '#3f00ff', '#7f00ff', '#bf00ff', '#ff00ff', '#ff00bf',
  '#ff007f', '#ff003f', '#ff0000',
];

function getEntityColor(entity: DwgEntityBase, isDark: boolean): string {
  // 如果有 24-bit color（RGB）
  if (entity.color !== undefined && entity.color !== 0) {
    const r = (entity.color >> 16) & 0xff;
    const g = (entity.color >> 8) & 0xff;
    const b = entity.color & 0xff;
    return `rgb(${r},${g},${b})`;
  }
  // ACI color index
  const idx = entity.colorIndex ?? 7; // 默认白色/黑色
  if (idx >= 0 && idx < ACI_COLORS.length) {
    const c = ACI_COLORS[idx];
    // 在暗色模式下，把黑色 (#000000) 替换成浅色
    if (isDark && c === '#000000') return '#e5e5e5';
    // 在亮色模式下，把白色 (#ffffff) 替换成黑色
    if (!isDark && c === '#ffffff') return '#000000';
    return c;
  }
  return isDark ? '#e5e5e5' : '#000000';
}

/* ------------------------------------------------------------------ */
/*  计算实体包围盒                                                      */
/* ------------------------------------------------------------------ */

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function expandBBox(bbox: BBox, x: number, y: number): void {
  if (x < bbox.minX) bbox.minX = x;
  if (x > bbox.maxX) bbox.maxX = x;
  if (y < bbox.minY) bbox.minY = y;
  if (y > bbox.maxY) bbox.maxY = y;
}

function getEntityBBox(entity: DwgEntity): BBox | null {
  const bbox: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  switch (entity.type) {
    case 'LINE': {
      const e = entity as DwgLineEntity;
      expandBBox(bbox, e.startPoint.x, e.startPoint.y);
      expandBBox(bbox, e.endPoint.x, e.endPoint.y);
      break;
    }
    case 'CIRCLE': {
      const e = entity as DwgCircleEntity;
      expandBBox(bbox, e.center.x - e.radius, e.center.y - e.radius);
      expandBBox(bbox, e.center.x + e.radius, e.center.y + e.radius);
      break;
    }
    case 'ARC': {
      const e = entity as DwgArcEntity;
      // 粗略用圆的包围盒
      expandBBox(bbox, e.center.x - e.radius, e.center.y - e.radius);
      expandBBox(bbox, e.center.x + e.radius, e.center.y + e.radius);
      break;
    }
    case 'ELLIPSE': {
      const e = entity as DwgEllipseEntity;
      const ax = Math.sqrt(e.majorAxisEndPoint.x ** 2 + e.majorAxisEndPoint.y ** 2);
      const ay = ax * e.axisRatio;
      expandBBox(bbox, e.center.x - ax, e.center.y - ay);
      expandBBox(bbox, e.center.x + ax, e.center.y + ay);
      break;
    }
    case 'POINT': {
      const e = entity as DwgPointEntity;
      expandBBox(bbox, e.position.x, e.position.y);
      break;
    }
    case 'LWPOLYLINE': {
      const e = entity as DwgLWPolylineEntity;
      for (const v of e.vertices) expandBBox(bbox, v.x, v.y);
      break;
    }
    case 'POLYLINE2D':
    case 'POLYLINE3D': {
      const e = entity as DwgPolyline2dEntity | DwgPolyline3dEntity;
      for (const v of e.vertices) expandBBox(bbox, v.x, v.y);
      break;
    }
    case 'TEXT': {
      const e = entity as DwgTextEntity;
      expandBBox(bbox, e.startPoint.x, e.startPoint.y);
      expandBBox(bbox, e.startPoint.x + e.text.length * e.textHeight * 0.6, e.startPoint.y + e.textHeight);
      break;
    }
    case 'MTEXT': {
      const e = entity as DwgMTextEntity;
      expandBBox(bbox, e.insertionPoint.x, e.insertionPoint.y);
      expandBBox(bbox, e.insertionPoint.x + e.rectWidth, e.insertionPoint.y + e.textHeight * 3);
      break;
    }
    case 'SPLINE': {
      const e = entity as DwgSplineEntity;
      for (const p of [...e.controlPoints, ...e.fitPoints])
        expandBBox(bbox, p.x, p.y);
      break;
    }
    case 'INSERT': {
      const e = entity as DwgInsertEntity;
      expandBBox(bbox, e.insertionPoint.x, e.insertionPoint.y);
      break;
    }
    case 'SOLID': {
      const e = entity as DwgSolidEntity;
      expandBBox(bbox, e.corner1.x, e.corner1.y);
      expandBBox(bbox, e.corner2.x, e.corner2.y);
      expandBBox(bbox, e.corner3.x, e.corner3.y);
      if (e.corner4) expandBBox(bbox, e.corner4.x, e.corner4.y);
      break;
    }
    case 'HATCH': {
      const e = entity as DwgHatchEntity;
      for (const path of e.boundaryPaths) {
        if (path.vertices) {
          for (const v of path.vertices) expandBBox(bbox, v.x, v.y);
        }
      }
      break;
    }
    case 'DIMENSION': {
      const e = entity as DwgDimensionEntity;
      expandBBox(bbox, e.definitionPoint.x, e.definitionPoint.y);
      if (e.subDefinitionPoint1) expandBBox(bbox, e.subDefinitionPoint1.x, e.subDefinitionPoint1.y);
      if (e.subDefinitionPoint2) expandBBox(bbox, e.subDefinitionPoint2.x, e.subDefinitionPoint2.y);
      break;
    }
    case 'RAY':
    case 'XLINE': {
      const e = entity as DwgRayEntity | DwgXlineEntity;
      expandBBox(bbox, e.firstPoint.x, e.firstPoint.y);
      expandBBox(bbox, e.firstPoint.x + e.unitDirection.x * 10000, e.firstPoint.y + e.unitDirection.y * 10000);
      break;
    }
    default:
      return null;
  }

  if (!isFinite(bbox.minX)) return null;
  return bbox;
}

function computeSceneBBox(entities: DwgEntity[]): BBox {
  const bbox: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const ent of entities) {
    if (ent.isVisible === false) continue;
    const eb = getEntityBBox(ent);
    if (!eb) continue;
    expandBBox(bbox, eb.minX, eb.minY);
    expandBBox(bbox, eb.maxX, eb.maxY);
  }
  // 兜底
  if (!isFinite(bbox.minX)) {
    return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  }
  // 增加 5% padding
  const w = bbox.maxX - bbox.minX || 1;
  const h = bbox.maxY - bbox.minY || 1;
  const pad = Math.max(w, h) * 0.05;
  return {
    minX: bbox.minX - pad,
    minY: bbox.minY - pad,
    maxX: bbox.maxX + pad,
    maxY: bbox.maxY + pad,
  };
}

/* ------------------------------------------------------------------ */
/*  B-Spline 基函数计算（用于 SPLINE 渲染）                            */
/* ------------------------------------------------------------------ */

function calcBSplinePoint(degree: number, knots: number[], controlPoints: DwgPoint3D[], t: number): DwgPoint3D {
  const n = controlPoints.length;
  // 找到 t 所在的 knot span
  let span = degree;
  for (let i = degree; i < n; i++) {
    if (t >= knots[i] && t < knots[i + 1]) { span = i; break; }
    if (i === n - 1) span = n - 1;
  }

  // de Boor 递归
  const d: DwgPoint3D[] = [];
  for (let j = 0; j <= degree; j++) {
    const idx = span - degree + j;
    if (idx >= 0 && idx < n) {
      d.push({ ...controlPoints[idx] });
    } else {
      d.push({ x: 0, y: 0, z: 0 });
    }
  }

  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const i = span - degree + j;
      const denom = knots[i + degree - r + 1] - knots[i];
      if (Math.abs(denom) < 1e-10) continue;
      const alpha = (t - knots[i]) / denom;
      d[j] = {
        x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
        y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
        z: 0,
      };
    }
  }
  return d[degree];
}

/* ------------------------------------------------------------------ */
/*  LWPOLYLINE bulge → 圆弧顶点插值                                    */
/* ------------------------------------------------------------------ */

function getArcPoints(p0: DwgPoint2D, p1: DwgPoint2D, bulge: number, segments = 16): DwgPoint2D[] {
  if (Math.abs(bulge) < 1e-10) return [p1];

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const chord = Math.sqrt(dx * dx + dy * dy);
  if (chord < 1e-10) return [p1];

  const sagitta = Math.abs(bulge) * chord / 2;
  const radius = (chord * chord / 4 + sagitta * sagitta) / (2 * sagitta);

  const midX = (p0.x + p1.x) / 2;
  const midY = (p0.y + p1.y) / 2;
  const dist = radius - sagitta;

  // 圆心
  const sign = bulge > 0 ? 1 : -1;
  const cx = midX + dist * (-dy / chord) * sign;
  const cy = midY + dist * (dx / chord) * sign;

  const startAngle = Math.atan2(p0.y - cy, p0.x - cx);
  let endAngle = Math.atan2(p1.y - cy, p1.x - cx);

  let sweep = endAngle - startAngle;
  if (bulge > 0 && sweep < 0) sweep += Math.PI * 2;
  if (bulge < 0 && sweep > 0) sweep -= Math.PI * 2;

  const points: DwgPoint2D[] = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const angle = startAngle + sweep * t;
    points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  return points;
}

/* ------------------------------------------------------------------ */
/*  Canvas 2D 渲染引擎                                                */
/* ------------------------------------------------------------------ */

function renderEntities(
  ctx: CanvasRenderingContext2D,
  entities: DwgEntity[],
  canvasW: number,
  canvasH: number,
  sceneBBox: BBox,
  scale: number,
  panX: number,
  panY: number,
  isDark: boolean,
  db?: DwgDatabase,
): number {
  const sceneW = sceneBBox.maxX - sceneBBox.minX;
  const sceneH = sceneBBox.maxY - sceneBBox.minY;
  if (sceneW === 0 || sceneH === 0) return 0;

  // 计算基础缩放：让场景适配画布
  const fitScale = Math.min(canvasW / sceneW, canvasH / sceneH);
  const totalScale = fitScale * scale;

  // 场景中心
  const sceneCx = (sceneBBox.minX + sceneBBox.maxX) / 2;
  const sceneCy = (sceneBBox.minY + sceneBBox.maxY) / 2;

  // 清空
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.save();

  // 移动画布中心，再缩放（Y 翻转），再偏移到场景中心
  ctx.translate(canvasW / 2 + panX, canvasH / 2 + panY);
  ctx.scale(totalScale, -totalScale); // Y 翻转
  ctx.translate(-sceneCx, -sceneCy);

  // 线宽补偿（缩放后保持 1px 视觉宽度）
  const lw = 1 / totalScale;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let count = 0;

  count += renderEntityList(ctx, entities, lw, isDark, db);

  ctx.restore();
  return count;
}

/**
 * 递归渲染实体列表（不清理画布、不设置主变换）
 * 供 renderEntities 和 INSERT 块递归调用
 */
function renderEntityList(
  ctx: CanvasRenderingContext2D,
  entities: DwgEntity[],
  lw: number,
  isDark: boolean,
  db?: DwgDatabase,
): number {
  let count = 0;

  for (const entity of entities) {
    if (entity.isVisible === false) continue;

    const color = getEntityColor(entity, isDark);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    switch (entity.type) {
      case 'LINE': {
        const e = entity as DwgLineEntity;
        ctx.beginPath();
        ctx.moveTo(e.startPoint.x, e.startPoint.y);
        ctx.lineTo(e.endPoint.x, e.endPoint.y);
        ctx.stroke();
        count++;
        break;
      }

      case 'CIRCLE': {
        const e = entity as DwgCircleEntity;
        ctx.beginPath();
        ctx.arc(e.center.x, e.center.y, e.radius, 0, Math.PI * 2);
        ctx.stroke();
        count++;
        break;
      }

      case 'ARC': {
        const e = entity as DwgArcEntity;
        // DXF/DWG arc 角度是度数，Canvas 要弧度
        // DXF 角度是逆时针（CCW），翻转 Y 后方向不变，直接用
        const sa = (e.startAngle * Math.PI) / 180;
        const ea = (e.endAngle * Math.PI) / 180;
        ctx.beginPath();
        ctx.arc(e.center.x, e.center.y, e.radius, sa, ea, false);
        ctx.stroke();
        count++;
        break;
      }

      case 'ELLIPSE': {
        const e = entity as DwgEllipseEntity;
        const majorLen = Math.sqrt(e.majorAxisEndPoint.x ** 2 + e.majorAxisEndPoint.y ** 2);
        if (majorLen < 1e-10) break;
        const minorLen = majorLen * e.axisRatio;
        const rotation = Math.atan2(e.majorAxisEndPoint.y, e.majorAxisEndPoint.x);

        ctx.beginPath();
        ctx.ellipse(e.center.x, e.center.y, majorLen, minorLen, rotation, e.startAngle, e.endAngle, false);
        ctx.stroke();
        count++;
        break;
      }

      case 'POINT': {
        const e = entity as DwgPointEntity;
        const ptSize = lw * 3;
        ctx.fillRect(e.position.x - ptSize / 2, e.position.y - ptSize / 2, ptSize, ptSize);
        count++;
        break;
      }

      case 'LWPOLYLINE': {
        const e = entity as DwgLWPolylineEntity;
        if (e.vertices.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(e.vertices[0].x, e.vertices[0].y);
        for (let i = 0; i < e.vertices.length - 1; i++) {
          const v0 = e.vertices[i];
          const v1 = e.vertices[i + 1];
          const bulge = v0.bulge ?? 0;
          if (Math.abs(bulge) > 1e-10) {
            const arcPts = getArcPoints(v0, v1, bulge);
            for (const p of arcPts) ctx.lineTo(p.x, p.y);
          } else {
            ctx.lineTo(v1.x, v1.y);
          }
        }
        // 闭合检测（flag bit 1）
        if (e.flag & 1) {
          const last = e.vertices[e.vertices.length - 1];
          const first = e.vertices[0];
          const bulge = last.bulge ?? 0;
          if (Math.abs(bulge) > 1e-10) {
            const arcPts = getArcPoints(last, first, bulge);
            for (const p of arcPts) ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();
        }
        ctx.stroke();
        count++;
        break;
      }

      case 'POLYLINE2D':
      case 'POLYLINE3D': {
        const e = entity as DwgPolyline2dEntity | DwgPolyline3dEntity;
        if (e.vertices.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(e.vertices[0].x, e.vertices[0].y);
        for (let i = 1; i < e.vertices.length; i++) {
          ctx.lineTo(e.vertices[i].x, e.vertices[i].y);
        }
        if (e.flag & 1) ctx.closePath();
        ctx.stroke();
        count++;
        break;
      }

      case 'TEXT': {
        const e = entity as DwgTextEntity;
        if (!e.text) break;
        const fontSize = e.textHeight;
        if (fontSize < 0.01) break;

        ctx.save();
        ctx.translate(e.startPoint.x, e.startPoint.y);
        // Y 翻转回来（因为整个画布是翻转的）
        ctx.scale(1, -1);
        if (e.rotation) ctx.rotate(e.rotation * Math.PI / 180);
        ctx.font = `${fontSize}px monospace`;
        ctx.textBaseline = 'bottom';
        ctx.fillText(e.text, 0, 0);
        ctx.restore();
        count++;
        break;
      }

      case 'MTEXT': {
        const e = entity as DwgMTextEntity;
        if (!e.text) break;
        const fontSize = e.textHeight;
        if (fontSize < 0.01) break;

        ctx.save();
        ctx.translate(e.insertionPoint.x, e.insertionPoint.y);
        ctx.scale(1, -1);
        if (e.rotation) ctx.rotate(e.rotation * Math.PI / 180);
        ctx.font = `${fontSize}px monospace`;
        ctx.textBaseline = 'top';

        // 简单的 MTEXT 渲染：去掉格式化标记，按行渲染
        let plainText = e.text
          .replace(/\\P/g, '\n')        // 段落换行
          .replace(/\\L/g, '')           // 下划线
          .replace(/\\l/g, '')
          .replace(/\\O/g, '')           // 上划线
          .replace(/\\o/g, '')
          .replace(/\\[A-Za-z][^;]*;/g, '') // {\fArial|b1|i0;xxx} 等
          .replace(/\{[^}]*\}/g, (m) => {
            // 提取 {} 中的实际文字
            const parts = m.replace(/^\{/, '').replace(/\}$/, '').split(';');
            return parts[parts.length - 1] || '';
          })
          .replace(/%%[a-zA-Z]/g, (m) => {
            // 特殊字符
            if (m === '%%d') return '°';
            if (m === '%%p') return '±';
            if (m === '%%c') return '∅';
            return m;
          });

        const lines = plainText.split('\n');
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], 0, i * fontSize * 1.2);
        }
        ctx.restore();
        count++;
        break;
      }

      case 'SPLINE': {
        const e = entity as DwgSplineEntity;
        // 优先用 fitPoints，没有则用 controlPoints + knots 做 B-spline
        if (e.fitPoints.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(e.fitPoints[0].x, e.fitPoints[0].y);
          for (let i = 1; i < e.fitPoints.length; i++) {
            ctx.lineTo(e.fitPoints[i].x, e.fitPoints[i].y);
          }
          ctx.stroke();
        } else if (e.controlPoints.length >= 2 && e.knots.length > 0) {
          const kMin = e.knots[e.degree];
          const kMax = e.knots[e.knots.length - 1 - e.degree];
          if (kMax <= kMin) break;
          const steps = Math.max(e.controlPoints.length * 8, 50);
          ctx.beginPath();
          let started = false;
          for (let i = 0; i <= steps; i++) {
            const t = kMin + (kMax - kMin) * (i / steps);
            const p = calcBSplinePoint(e.degree, e.knots, e.controlPoints, t);
            if (!started) {
              ctx.moveTo(p.x, p.y);
              started = true;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          }
          ctx.stroke();
        }
        count++;
        break;
      }

      case 'INSERT': {
        // Block 引用 — 递归渲染块内容
        const e = entity as DwgInsertEntity;
        // 查找 BLOCK_RECORD 中的块定义
        const blockRecords = db?.tables?.BLOCK_RECORD?.entries ?? [];
        const blockDef = blockRecords.find((b) => b.name === e.name);
        if (blockDef?.entities?.length) {
          ctx.save();
          ctx.translate(e.insertionPoint.x, e.insertionPoint.y);
          const sx = typeof e.xScale === 'number' && isFinite(e.xScale) ? e.xScale : 1;
          const sy = typeof e.yScale === 'number' && isFinite(e.yScale) ? e.yScale : sx;
          const rot = typeof e.rotation === 'number' ? e.rotation : 0;
          // 按飞鱼的顺序: translate → rotate → scale → (-basePoint)
          if (rot !== 0) ctx.rotate((rot * Math.PI) / 180);
          if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
          // 应用块的 basePoint 偏移
          const bp = blockDef.basePoint;
          if (bp && (bp.x !== 0 || bp.y !== 0)) ctx.translate(-bp.x, -bp.y);
          count += renderEntityList(ctx, blockDef.entities, lw, isDark, db);
          ctx.restore();
        } else {
          // 找不到块定义，回退为十字标记
          const sz = lw * 4;
          ctx.beginPath();
          ctx.moveTo(e.insertionPoint.x - sz, e.insertionPoint.y);
          ctx.lineTo(e.insertionPoint.x + sz, e.insertionPoint.y);
          ctx.moveTo(e.insertionPoint.x, e.insertionPoint.y - sz);
          ctx.lineTo(e.insertionPoint.x, e.insertionPoint.y + sz);
          ctx.stroke();
          count++;
        }
        break;
      }

      case 'SOLID': {
        const e = entity as DwgSolidEntity;
        ctx.beginPath();
        // SOLID 的顶点顺序是 1-2-4-3（对角线连接）
        ctx.moveTo(e.corner1.x, e.corner1.y);
        ctx.lineTo(e.corner2.x, e.corner2.y);
        ctx.lineTo(e.corner4 ? e.corner4.x : e.corner3.x, e.corner4 ? e.corner4.y : e.corner3.y);
        ctx.lineTo(e.corner3.x, e.corner3.y);
        ctx.closePath();
        ctx.fill();
        count++;
        break;
      }

      case 'HATCH': {
        const e = entity as DwgHatchEntity;
        for (const path of e.boundaryPaths) {
          if (path.vertices && path.vertices.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(path.vertices[0].x, path.vertices[0].y);
            for (let i = 1; i < path.vertices.length; i++) {
              const v = path.vertices[i];
              const prev = path.vertices[i - 1];
              const bulge = (prev as DwgLWPolylineVertex).bulge ?? 0;
              if (Math.abs(bulge) > 1e-10) {
                const arcPts = getArcPoints(prev, v, bulge, 8);
                for (const p of arcPts) ctx.lineTo(p.x, p.y);
              } else {
                ctx.lineTo(v.x, v.y);
              }
            }
            if (e.solidFill === 1) {
              ctx.closePath();
              ctx.fill();
            } else {
              ctx.stroke();
            }
          } else if (path.edges) {
            for (const edge of path.edges) {
              switch (edge.type) {
                case 1: // Line
                  if (edge.start && edge.end) {
                    ctx.beginPath();
                    ctx.moveTo(edge.start.x, edge.start.y);
                    ctx.lineTo(edge.end.x, edge.end.y);
                    ctx.stroke();
                  }
                  break;
                case 2: // Arc
                  if (edge.center && edge.radius) {
                    const sa = (edge.startAngle ?? 0) * Math.PI / 180;
                    const ea = (edge.endAngle ?? 360) * Math.PI / 180;
                    ctx.beginPath();
                    ctx.arc(edge.center.x, edge.center.y, edge.radius, sa, ea, !edge.isCCW);
                    ctx.stroke();
                  }
                  break;
                case 3: // Ellipse
                  if (edge.center && edge.end) {
                    const majLen = Math.sqrt(edge.end.x ** 2 + edge.end.y ** 2);
                    if (majLen > 1e-10) {
                      const rot = Math.atan2(edge.end.y, edge.end.x);
                      ctx.beginPath();
                      ctx.ellipse(edge.center.x, edge.center.y, majLen, majLen * ((edge as { lengthOfMinorAxis?: number }).lengthOfMinorAxis ?? 1), rot, edge.startAngle ?? 0, edge.endAngle ?? Math.PI * 2, false);
                      ctx.stroke();
                    }
                  }
                  break;
              }
            }
          }
        }
        count++;
        break;
      }

      case 'DIMENSION': {
        const e = entity as DwgDimensionEntity;
        // 简化渲染：画定义点连线 + 标注文字
        if (e.subDefinitionPoint1 && e.subDefinitionPoint2) {
          ctx.beginPath();
          ctx.moveTo(e.subDefinitionPoint1.x, e.subDefinitionPoint1.y);
          ctx.lineTo(e.subDefinitionPoint2.x, e.subDefinitionPoint2.y);
          ctx.stroke();
        }
        // 标注文字
        const txt = e.text ?? (e.measurement !== undefined ? e.measurement.toFixed(1) : '');
        if (txt) {
          ctx.save();
          ctx.translate(e.textPoint.x, e.textPoint.y);
          ctx.scale(1, -1);
          const fontSize = Math.abs(e.definitionPoint.z) || 2.5;
          ctx.font = `${fontSize}px monospace`;
          ctx.textBaseline = 'middle';
          ctx.fillText(txt, 0, 0);
          ctx.restore();
        }
        count++;
        break;
      }

      case 'RAY':
      case 'XLINE': {
        const e = entity as DwgRayEntity | DwgXlineEntity;
        const len = 50000;
        const x1 = e.firstPoint.x;
        const y1 = e.firstPoint.y;
        const x2 = x1 + e.unitDirection.x * len;
        const y2 = y1 + e.unitDirection.y * len;
        let x3 = x1, y3 = y1;
        if (entity.type === 'XLINE') {
          x3 = x1 - e.unitDirection.x * len;
          y3 = y1 - e.unitDirection.y * len;
        }
        ctx.beginPath();
        ctx.moveTo(x3, y3);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        count++;
        break;
      }

      default:
        break;
    }
  }

  return count;
}

/* ------------------------------------------------------------------ */
/*  CAD 渲染器组件                                                      */
/* ------------------------------------------------------------------ */

export function CadRenderer({ fileName, fileUrl, fileBuffer, onError, className }: CadRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('初始化...');
  const [entCount, setEntCount] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(100);

  /* 数据库引用 */
  const dbRef = useRef<DwgDatabase | null>(null);
  const sceneBBoxRef = useRef<BBox>({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 });

  /* 视图状态 */
  const viewRef = useRef({ scale: 1, panX: 0, panY: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  const isDarkRef = useRef(isDark);

  /* ------------------------------------------------------------------ */
  /*  绘制到 Canvas                                                      */
  /* ------------------------------------------------------------------ */

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const db = dbRef.current;
    if (!canvas || !db) return;

    const container = canvas.parentElement;
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // 高 DPI 支持
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const { scale, panX, panY } = viewRef.current;
    const count = renderEntities(ctx, db.entities, w, h, sceneBBoxRef.current, scale, panX, panY, isDarkRef.current, db);
    setEntCount(count);
  }, []);

  /* ------------------------------------------------------------------ */
  /*  加载文件                                                            */
  /* ------------------------------------------------------------------ */

  const loadBuffer = useCallback(async (): Promise<ArrayBuffer> => {
    if (fileBuffer) return fileBuffer;
    if (fileUrl) {
      const r = await fetch(fileUrl);
      return r.arrayBuffer();
    }
    throw new Error('未提供文件内容');
  }, [fileUrl, fileBuffer]);

  /* ------------------------------------------------------------------ */
  /*  解析 DWG/DXF → DwgDatabase                                        */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        setStatusText('加载 LibreDWG WASM...');
        const buf = await loadBuffer();
        const { Dwg_File_Type, LibreDwg } = await import('@mlightcad/libredwg-web');

        if (disposed) return;
        setStatusText('初始化 WASM...');
        const libredwg = await LibreDwg.create('/wasm/libredwg/');

        if (disposed) return;
        setStatusText('解析文件...');
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const ft = ext === 'dxf' ? Dwg_File_Type.DXF : Dwg_File_Type.DWG;
        const ptr = libredwg.dwg_read_data(buf, ft);

        if (disposed) return;
        if (ptr === undefined || ptr === null) throw new Error('解析失败');

        setStatusText('转换为数据库...');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = libredwg.convert(ptr) as any as DwgDatabase;

        /* 释放 WASM 内存 */
        libredwg.dwg_free(ptr);

        if (disposed) return;
        if (!db || !db.entities) throw new Error('数据库转换失败');

        // [DEBUG] 打印 db 的结构，确认字段名
        console.log('[CAD] db keys:', Object.keys(db));
        console.log('[CAD] db.tables keys:', db.tables ? Object.keys(db.tables) : 'no tables');
        if (db.tables?.BLOCK_RECORD) {
          const br = db.tables.BLOCK_RECORD;
          console.log('[CAD] BLOCK_RECORD keys:', Object.keys(br));
          const entries = (br as any).entries ?? (br as any).blocks ?? [];
          console.log('[CAD] BLOCK_RECORD entries count:', entries.length);
          if (entries.length > 0) {
            console.log('[CAD] first block:', entries[0]?.name, 'entities:', entries[0]?.entities?.length);
          }
        }
        console.log('[CAD] entities count:', db.entities.length);
        console.log('[CAD] first entity:', db.entities[0]?.type);
        // 统计 INSERT 数量
        const insertCount = db.entities.filter((e: any) => e.type === 'INSERT').length;
        console.log('[CAD] INSERT count:', insertCount);

        dbRef.current = db;
        sceneBBoxRef.current = computeSceneBBox(db.entities);

        console.log('[CAD] 实体数量:', db.entities.length, '场景包围盒:', sceneBBoxRef.current);

        /* 初始视图 */
        viewRef.current = { scale: 1, panX: 0, panY: 0 };
        setLoading(false);
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : '加载 CAD 文件失败');
          setLoading(false);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    /* 监听暗色模式切换 */
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      isDarkRef.current = dark;
      setIsDark(dark);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    isDarkRef.current = isDark;

    return () => { disposed = true; observer.disconnect(); };
  }, [loadBuffer, fileName, onError]);

  /* ------------------------------------------------------------------ */
  /*  loading 结束后渲染                                                  */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!loading && !error && dbRef.current) {
      requestAnimationFrame(() => {
        draw();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error]);

  /* 暗色模式 / 窗口大小变化时重绘 */
  useEffect(() => {
    draw();
  }, [isDark, draw]);

  useEffect(() => {
    const h = () => draw();
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [draw]);

  /* ------------------------------------------------------------------ */
  /*  适应视图                                                            */
  /* ------------------------------------------------------------------ */

  const fitToView = useCallback(() => {
    viewRef.current = { scale: 1, panX: 0, panY: 0 };
    setZoomPercent(100);
    draw();
  }, [draw]);

  /* ------------------------------------------------------------------ */
  /*  缩放                                                                */
  /* ------------------------------------------------------------------ */

  const applyZoom = useCallback((newScale: number, centerX?: number, centerY?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cx = centerX ?? rect.width / 2;
    const cy = centerY ?? rect.height / 2;

    const oldScale = viewRef.current.scale;
    const factor = newScale / oldScale;

    viewRef.current.panX = cx - factor * (cx - viewRef.current.panX);
    viewRef.current.panY = cy - factor * (cy - viewRef.current.panY);
    viewRef.current.scale = newScale;

    setZoomPercent(Math.round(newScale * 100));
    draw();
  }, [draw]);

  /* ------------------------------------------------------------------ */
  /*  交互：滚轮缩放                                                      */
  /* ------------------------------------------------------------------ */

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = viewRef.current.scale * factor;
    applyZoom(newScale, mx, my);
  }, [applyZoom]);

  /* ------------------------------------------------------------------ */
  /*  交互：拖拽平移                                                      */
  /* ------------------------------------------------------------------ */

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      panX: viewRef.current.panX,
      panY: viewRef.current.panY,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    viewRef.current.panX = dragStart.current.panX + dx;
    viewRef.current.panY = dragStart.current.panY + dy;
    draw();
  }, [draw]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  /* ------------------------------------------------------------------ */
  /*  全屏                                                                */
  /* ------------------------------------------------------------------ */

  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /*  渲染                                                                */
  /* ------------------------------------------------------------------ */

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[400px] ${className ?? ''}`}
    >
      {/* Canvas 渲染区域 */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{
          cursor: isDragging.current ? 'grabbing' : 'grab',
          background: isDark ? '#1a1a1a' : '#ffffff',
        }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {/* 加载中 */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{statusText}</span>
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 z-10">
          <AlertTriangle className="w-8 h-8 text-orange-500" />
          <p className="text-sm text-muted-foreground max-w-md text-center px-4">{error}</p>
        </div>
      )}

      {/* 工具栏 */}
      {!loading && !error && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-lg p-1 border border-border shadow-sm">
          <span className="text-xs text-muted-foreground px-2">
            {entCount} 实体 · {zoomPercent}%
          </span>
          <div className="w-px h-4 bg-border" />
          <button
            onClick={() => applyZoom(viewRef.current.scale * 1.2)}
            className="p-1.5 hover:bg-accent rounded"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => applyZoom(viewRef.current.scale / 1.2)}
            className="p-1.5 hover:bg-accent rounded"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={fitToView}
            className="p-1.5 hover:bg-accent rounded"
            title="适应窗口"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 hover:bg-accent rounded"
            title="全屏"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
