'use client';

/**
 * PSD 设计文件渲染器
 *
 * 功能：
 * - 手动解析 PSD 文件头（不依赖 psd.js，纯前端）
 * - 显示：文件版本、尺寸、颜色模式、位深度、图层数
 * - 提取合并图像预览（composite image）—— 如果能解析到
 * - 图层列表（名称、可见性、尺寸）
 */

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Image, Layers } from 'lucide-react';

interface PsdRendererProps {
  fileName: string;
  fileUrl?: string;
  fileBuffer?: ArrayBuffer;
  onError?: (err: Error) => void;
  className?: string;
}

interface PsdInfo {
  version: number;
  width: number;
  height: number;
  channels: number;
  depth: number;
  colorMode: string;
  layerCount: number;
  /** 图层信息 */
  layers: { name: string; visible: boolean; left: number; top: number; right: number; bottom: number }[];
}

/** 颜色模式映射 */
const COLOR_MODES: Record<number, string> = {
  0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 3: 'RGB', 4: 'CMYK',
  7: 'Multichannel', 8: 'Duotone', 9: 'Lab',
};

/** 读取 Uint16 大端 */
function readUint16BE(buf: ArrayBuffer, offset: number): number {
  return new DataView(buf).getUint16(offset, false);
}
/** 读取 Uint32 大端 */
function readUint32BE(buf: ArrayBuffer, offset: number): number {
  return new DataView(buf).getUint32(offset, false);
}

/** 解析 PSD 文件头和图层信息 */
function parsePsdHeader(buf: ArrayBuffer): PsdInfo {
  const dv = new DataView(buf);
  /* 魔数 "8BPS" */
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== '8BPS') throw new Error('不是有效的 PSD 文件（魔数不匹配）');

  const version = readUint16BE(buf, 4);
  const channels = readUint16BE(buf, 12);
  const height = readUint32BE(buf, 14);
  const width = readUint32BE(buf, 18);
  const depth = readUint16BE(buf, 22);
  const colorMode = readUint16BE(buf, 24);

  /* 跳过 Color Data 和 Image Resources 段 */
  let offset = 26;
  const colorDataLen = readUint32BE(buf, offset); offset += 4 + colorDataLen;
  const imageResLen = readUint32BE(buf, offset); offset += 4 + imageResLen;

  /* Layer and Mask Information */
  const layerMaskLen = readUint32BE(buf, offset); offset += 4;
  const layers: PsdInfo['layers'] = [];
  let layerCount = 0;

  if (layerMaskLen > 0) {
    const layerInfoLen = readUint32BE(buf, offset); offset += 4;
    if (layerInfoLen > 0) {
      layerCount = dv.getInt16(offset); offset += 2;
      /* 每个图层 68 字节头 + 可变额外数据 */
      for (let i = 0; i < Math.min(layerCount, 100); i++) {
        const top = dv.getInt32(offset); offset += 4;
        const left = dv.getInt32(offset); offset += 4;
        const bottom = dv.getInt32(offset); offset += 4;
        const right = dv.getInt32(offset); offset += 4;
        const numChannels = readUint16BE(buf, offset); offset += 2;
        /* 跳过通道信息 (6字节/通道) */
        offset += numChannels * 6;
        /* 混合模式签名 "8BIM" */
        offset += 4;
        /* 混合模式 key */
        offset += 4;
        /* opacity, clipping, flags, filler */
        offset += 4;
        /* 额外数据长度 */
        const extraLen = readUint32BE(buf, offset); offset += 4;
        const extraEnd = offset + extraLen;
        /* Layer mask data */
        const maskLen = readUint32BE(buf, offset); offset += 4 + maskLen;
        /* Layer blending ranges */
        const blendLen = readUint32BE(buf, offset); offset += 4 + blendLen;
        /* Layer name (Pascal string, 4-byte aligned) */
        const nameLen = dv.getUint8(offset); offset += 1;
        const nameBytes = new Uint8Array(buf, offset, nameLen);
        const name = new TextDecoder().decode(nameBytes);
        offset += nameLen;
        /* 对齐到4字节 */
        offset = extraEnd;

        layers.push({
          name: name || `图层 ${i + 1}`,
          visible: true,
          left, top, right, bottom,
        });
      }
    }
  }

  return {
    version, width, height, channels, depth,
    colorMode: COLOR_MODES[colorMode] || `未知(${colorMode})`,
    layerCount: Math.abs(layerCount),
    layers,
  };
}

/* ------------------------------------------------------------------ */
/*  PSD 渲染器                                                         */
/* ------------------------------------------------------------------ */

export function PsdRenderer({ fileName, fileUrl, fileBuffer, onError, className }: PsdRendererProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<PsdInfo | null>(null);

  const loadBuffer = useCallback(async (): Promise<ArrayBuffer> => {
    if (fileBuffer) return fileBuffer;
    if (fileUrl) { const r = await fetch(fileUrl); return r.arrayBuffer(); }
    throw new Error('未提供文件内容');
  }, [fileUrl, fileBuffer]);

  useEffect(() => {
    (async () => {
      try {
        const buf = await loadBuffer();
        const psd = parsePsdHeader(buf);
        setInfo(psd);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : '解析 PSD 失败');
        setLoading(false);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  }, [loadBuffer, onError]);

  return (
    <div className={`flex flex-col h-full min-h-0 ${className ?? ''}`}>
      {loading && (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          解析 PSD 文件...
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center gap-2 h-full p-4">
          <AlertTriangle className="w-8 h-8 text-orange-500" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {info && !loading && (
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* 文件信息 */}
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
              <Image className="w-8 h-8 text-purple-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium">{fileName}</h3>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>尺寸：{info.width} × {info.height} px</div>
                <div>颜色模式：{info.colorMode} · {info.depth} 位 · {info.channels} 通道</div>
                <div>PSD 版本：{info.version}</div>
              </div>
            </div>
          </div>

          {/* 图层列表 */}
          {info.layers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  图层（{info.layerCount}）
                </span>
              </div>
              <div className="space-y-1">
                {info.layers.map((layer, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/20 text-xs">
                    <div className={`w-2 h-2 rounded-full ${layer.visible ? 'bg-green-400' : 'bg-muted-foreground/30'}`} />
                    <span className="flex-1 truncate">{layer.name}</span>
                    <span className="text-muted-foreground">
                      {layer.right - layer.left}×{layer.bottom - layer.top}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground/50 italic">
            注：当前仅解析 PSD 文件头和图层元信息，不渲染像素内容。
          </p>
        </div>
      )}
    </div>
  );
}
