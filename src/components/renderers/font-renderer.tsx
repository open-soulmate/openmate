'use client';

/**
 * 字体文件渲染器
 *
 * 功能：
 * - 用 FontFace API 加载字体
 * - 显示字体名称、文件信息
 * - 字符集样本预览：A-Z、a-z、0-9、中文常用字
 * - 不同字号预览
 */

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Type } from 'lucide-react';

interface FontRendererProps {
  fileName: string;
  fileUrl?: string;
  fileBuffer?: ArrayBuffer;
  onError?: (err: Error) => void;
  className?: string;
}

const SAMPLE_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SAMPLE_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const SAMPLE_DIGITS = '0123456789';
const SAMPLE_CN = '天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏';
const SAMPLE_PUNCT = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`';

const FONT_SIZES = [12, 16, 20, 24, 32, 48];

export function FontRenderer({ fileName, fileUrl, fileBuffer, onError, className }: FontRendererProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fontName, setFontName] = useState('');
  const [customSize, setCustomSize] = useState(24);

  const loadBuffer = useCallback(async (): Promise<ArrayBuffer> => {
    if (fileBuffer) return fileBuffer;
    if (fileUrl) { const r = await fetch(fileUrl); return r.arrayBuffer(); }
    throw new Error('未提供文件内容');
  }, [fileUrl, fileBuffer]);

  useEffect(() => {
    (async () => {
      try {
        const buf = await loadBuffer();
        /* 用文件名作为字体族名（避免冲突） */
        const family = 'Preview_' + fileName.replace(/[^a-zA-Z0-9]/g, '_');
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        let format = 'truetype';
        if (ext === 'otf') format = 'opentype';
        else if (ext === 'woff') format = 'woff';
        else if (ext === 'woff2') format = 'woff2';

        const blob = new Blob([buf]);
        const url = URL.createObjectURL(blob);

        const font = new FontFace(family, `url(${url})`, { format } as FontFaceDescriptors);
        await font.load();
        document.fonts.add(font);

        setFontName(family);
        setLoading(false);

        return () => { URL.revokeObjectURL(url); document.fonts.delete(font); };
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载字体失败');
        setLoading(false);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  }, [loadBuffer, fileName, onError]);

  const previewFont = fontName || 'inherit';

  return (
    <div className={`flex flex-col h-full min-h-0 ${className ?? ''}`}>
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-[var(--color-secondary)]">
        <Type className="w-4 h-4 text-green-400" />
        <span className="text-xs font-medium">{fileName}</span>
        {fontName && <span className="text-xs text-green-400">✓ 已加载</span>}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {loading && <p className="text-sm text-muted-foreground">加载字体中...</p>}
        {error && (
          <div className="flex flex-col items-center gap-2">
            <AlertTriangle className="w-8 h-8 text-orange-500" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {fontName && (
          <>
            {/* 自定义预览 */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs text-muted-foreground">自定义大小：</span>
                <input
                  type="range" min={8} max={120} value={customSize}
                  onChange={e => setCustomSize(Number(e.target.value))}
                  className="w-32"
                />
                <span className="text-xs text-muted-foreground">{customSize}px</span>
              </div>
              <div style={{ fontFamily: previewFont, fontSize: customSize, lineHeight: 1.4 }}>
                The quick brown fox jumps over the lazy dog. 快速的棕色狐狸跳过了懒狗。
              </div>
            </div>

            {/* 字号阶梯 */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">字号阶梯</h4>
              {FONT_SIZES.map(size => (
                <div key={size} className="flex items-baseline gap-3 mb-1">
                  <span className="text-[10px] text-muted-foreground w-8 text-right">{size}px</span>
                  <span style={{ fontFamily: previewFont, fontSize: size, lineHeight: 1.3 }}>
                    Aa Bb 永
                  </span>
                </div>
              ))}
            </div>

            {/* 字符集 */}
            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">大写字母</h4>
                <div style={{ fontFamily: previewFont, fontSize: 18, letterSpacing: 2 }}>{SAMPLE_UPPER}</div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">小写字母</h4>
                <div style={{ fontFamily: previewFont, fontSize: 18, letterSpacing: 2 }}>{SAMPLE_LOWER}</div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">数字</h4>
                <div style={{ fontFamily: previewFont, fontSize: 18, letterSpacing: 2 }}>{SAMPLE_DIGITS}</div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">中文</h4>
                <div style={{ fontFamily: previewFont, fontSize: 18 }}>{SAMPLE_CN}</div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">标点符号</h4>
                <div style={{ fontFamily: previewFont, fontSize: 16 }}>{SAMPLE_PUNCT}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
