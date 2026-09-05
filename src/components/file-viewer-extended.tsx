'use client';

/**
 * 扩展 FileViewer 组件
 *
 * 在 openface 的 FileViewer 基础上扩展，支持更多文件格式：
 * - mermaid（.mmd / .mermaid）→ MermaidRenderer
 * - plantuml（.puml / .plantuml）→ 占位
 * - drawio（.drawio / .dio）→ 占位
 * - xmind（.xmind）→ 占位
 * - sqlite（.sqlite / .sqlite3 / .db）→ 占位
 * - eml（.eml / .msg / .mbox）→ 占位
 * - rtf（.rtf）→ 占位
 * - doc（.doc / .dot）→ 占位
 * - xls（.xls / .xlsm / .xlsb）→ 占位
 * - ppt（.ppt / .pot / .potm / .ppsx / .ppsm）→ 占位
 * - odt（.odt）→ 占位
 * - ods（.ods / .fods）→ 占位
 * - odp（.odp）→ 占位
 *
 * 其他格式透传给 openface 的 FileViewer。
 */

import { useMemo } from 'react';
import type { FileViewerProps } from '@opensoulmate/openface';
import { FileViewer as OpenFaceFileViewer } from '@opensoulmate/openface';
import { MermaidRenderer } from './renderers/mermaid-renderer';
import { Clock, Construction } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  扩展的文件类别                                                      */
/* ------------------------------------------------------------------ */

/** openface 不支持的新增格式类别 */
type ExtendedFileCategory =
  | 'mermaid'
  | 'plantuml'
  | 'drawio'
  | 'xmind'
  | 'sqlite'
  | 'eml'
  | 'rtf'
  | 'doc'
  | 'xls'
  | 'ppt'
  | 'odt'
  | 'ods'
  | 'odp';

/* ------------------------------------------------------------------ */
/*  扩展格式 → 类别映射                                                 */
/* ------------------------------------------------------------------ */

/** 扩展格式到类别的映射表 */
const EXTENDED_FORMAT_MAP: Record<string, ExtendedFileCategory> = {
  // Mermaid
  mmd: 'mermaid',
  mermaid: 'mermaid',
  // PlantUML
  puml: 'plantuml',
  plantuml: 'plantuml',
  // Draw.io
  drawio: 'drawio',
  dio: 'drawio',
  // XMind
  xmind: 'xmind',
  // SQLite
  sqlite: 'sqlite',
  sqlite3: 'sqlite',
  db: 'sqlite',
  // EML/邮件
  eml: 'eml',
  msg: 'eml',
  mbox: 'eml',
  // RTF
  rtf: 'rtf',
  // Word 旧格式
  doc: 'doc',
  dot: 'doc',
  // Excel 旧格式
  xls: 'xls',
  xlsm: 'xls',
  xlsb: 'xls',
  // PowerPoint 旧格式
  ppt: 'ppt',
  pot: 'ppt',
  potm: 'ppt',
  ppsx: 'ppt',
  ppsm: 'ppt',
  // OpenDocument
  odt: 'odt',
  ods: 'ods',
  fods: 'ods',
  odp: 'odp',
};

/* ------------------------------------------------------------------ */
/*  检测文件是否为扩展格式                                               */
/* ------------------------------------------------------------------ */

/**
 * 根据文件名判断是否属于扩展格式
 * @returns ExtendedFileCategory | null（null 表示非扩展格式，走 openface 逻辑）
 */
function detectExtendedCategory(
  fileName: string
): ExtendedFileCategory | null {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return EXTENDED_FORMAT_MAP[ext] ?? null;
}

/* ------------------------------------------------------------------ */
/*  占位渲染器（用于尚未实现的扩展格式）                                  */
/* ------------------------------------------------------------------ */

interface PlaceholderRendererProps {
  /** 文件类别名称 */
  category: string;
  /** 文件名 */
  fileName: string;
  /** 格式描述 */
  description: string;
}

/**
 * 占位渲染器：显示"即将支持"提示
 */
function PlaceholderRenderer({
  category,
  fileName,
  description,
}: PlaceholderRendererProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 工具栏 */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400">
          {category.toUpperCase()}
        </span>
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground/50 truncate max-w-[200px]">
          {fileName}
        </span>
      </div>

      {/* 占位内容 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground p-8">
        <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center">
          <Construction className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <div className="text-center max-w-md">
          <h3 className="text-base font-medium text-foreground mb-2">
            {category.toUpperCase()} 渲染器即将支持
          </h3>
          <p className="text-sm text-muted-foreground mb-1">{description}</p>
          <p className="text-xs text-muted-foreground/60">
            文件：{fileName}
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/20 text-xs text-muted-foreground/70">
          <Clock className="w-3 h-3" />
          <span>开发中，敬请期待</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  格式描述映射（占位渲染器使用）                                        */
/* ------------------------------------------------------------------ */

const FORMAT_DESCRIPTIONS: Record<ExtendedFileCategory, string> = {
  mermaid: 'Mermaid 图表渲染', // 已实现，不会走到占位
  plantuml: 'PlantUML UML 图表渲染，支持时序图、类图、活动图等',
  drawio: 'Draw.io (diagrams.net) 流程图和架构图渲染',
  xmind: 'XMind 思维导图渲染',
  sqlite: 'SQLite 数据库浏览器，支持查看表结构和执行查询',
  eml: '邮件文件渲染，支持查看邮件正文、附件和邮件头',
  rtf: 'RTF 富文本格式渲染',
  doc: 'Microsoft Word 旧格式 (.doc) 渲染',
  xls: 'Microsoft Excel 旧格式 (.xls) 渲染',
  ppt: 'Microsoft PowerPoint 旧格式 (.ppt) 渲染',
  odt: 'OpenDocument 文本格式渲染',
  ods: 'OpenDocument 电子表格渲染',
  odp: 'OpenDocument 演示文稿渲染',
};

/* ------------------------------------------------------------------ */
/*  扩展 FileViewer 主组件                                              */
/* ------------------------------------------------------------------ */

/**
 * 扩展的 FileViewer 组件
 *
 * 接口完全兼容 openface 的 FileViewerProps：
 * - 新格式（mermaid/plantuml/drawio 等）→ 自定义渲染器
 * - 其他格式 → 透传给 openface 的 FileViewer
 */
export function FileViewerExtended({
  fileName,
  mimeType,
  fileUrl,
  fileBuffer,
  fallbackIframeUrl,
  onSave,
  onSendToAgent,
  onError,
  className,
}: FileViewerProps) {
  /* 检测是否为扩展格式 */
  const extendedCategory = useMemo(
    () => detectExtendedCategory(fileName),
    [fileName]
  );

  /* -------- 扩展格式处理 -------- */
  if (extendedCategory) {
    switch (extendedCategory) {
      /* ---- Mermaid（已实现） ---- */
      case 'mermaid':
        return (
          <MermaidRenderer
            fileName={fileName}
            fileUrl={fileUrl}
            fileBuffer={fileBuffer}
            onError={onError}
            className={className}
          />
        );

      /* ---- 其他扩展格式（占位） ---- */
      default:
        return (
          <PlaceholderRenderer
            category={extendedCategory}
            fileName={fileName}
            description={FORMAT_DESCRIPTIONS[extendedCategory]}
          />
        );
    }
  }

  /* -------- 非扩展格式：透传给 openface -------- */
  return (
    <OpenFaceFileViewer
      fileName={fileName}
      mimeType={mimeType}
      fileUrl={fileUrl}
      fileBuffer={fileBuffer}
      fallbackIframeUrl={fallbackIframeUrl}
      onSave={onSave}
      onSendToAgent={onSendToAgent}
      onError={onError}
      className={className}
    />
  );
}
