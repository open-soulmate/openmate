'use client';

/**
 * HLS 流媒体播放列表渲染器
 *
 * 功能：
 * - 解析 .m3u8 文本
 * - 提取分段信息（#EXTINF）、码率、分辨率
 * - 用 HTML5 video + hls.js 播放（如果可能）
 * - 或显示播放列表信息
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, Play, Film } from 'lucide-react';

interface HlsRendererProps {
  fileName: string;
  fileUrl?: string;
  fileBuffer?: ArrayBuffer;
  onError?: (err: Error) => void;
  className?: string;
}

interface HlsInfo {
  version?: number;
  targetDuration?: number;
  isMasterPlaylist: boolean;
  streams: { bandwidth: number; resolution: string; codecs: string }[];
  segments: { duration: number; title: string; uri: string }[];
  totalDuration: number;
  raw: string;
}

function parseM3u8(text: string): HlsInfo {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const streams: HlsInfo['streams'] = [];
  const segments: HlsInfo['segments'] = [];
  let totalDuration = 0;
  let version: number | undefined;
  let targetDuration: number | undefined;
  let isMaster = false;
  let pendingStream: { bandwidth: number; resolution: string; codecs: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '#EXTM3U') continue;
    if (line.startsWith('#EXT-X-VERSION:')) { version = parseInt(line.split(':')[1]); }
    if (line.startsWith('#EXT-X-TARGETDURATION:')) { targetDuration = parseFloat(line.split(':')[1]); }
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      isMaster = true;
      const bw = /BANDWIDTH=(\d+)/.exec(line)?.[1] || '0';
      const res = /RESOLUTION=(\S+)/.exec(line)?.[1] || '';
      const codecs = /CODECS="([^"]+)"/.exec(line)?.[1] || '';
      pendingStream = { bandwidth: parseInt(bw), resolution: res, codecs };
    } else if (pendingStream && !line.startsWith('#')) {
      streams.push(pendingStream);
      pendingStream = null;
    }
    if (line.startsWith('#EXTINF:')) {
      const dur = parseFloat(line.split(':')[1]);
      const title = line.includes(',') ? line.split(',')[1] : '';
      const uri = lines[i + 1] || '';
      if (!uri.startsWith('#')) {
        segments.push({ duration: dur, title, uri });
        totalDuration += dur;
      }
    }
  }

  return { version, targetDuration, isMasterPlaylist: isMaster, streams, segments, totalDuration, raw: text };
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function HlsRenderer({ fileName, fileUrl, fileBuffer, onError, className }: HlsRendererProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<HlsInfo | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const loadContent = useCallback(async (): Promise<string> => {
    if (fileBuffer) return new TextDecoder().decode(fileBuffer);
    if (fileUrl) { const r = await fetch(fileUrl); return r.text(); }
    throw new Error('未提供文件内容');
  }, [fileUrl, fileBuffer]);

  useEffect(() => {
    (async () => {
      try {
        const text = await loadContent();
        const m3u8 = parseM3u8(text);
        setInfo(m3u8);

        /* 尝试用 hls.js 播放 */
        if (!m3u8.isMasterPlaylist && fileUrl && videoRef.current) {
          try {
            const Hls = (await import('hls.js')).default;
            if (Hls.isSupported()) {
              const hls = new Hls();
              hls.loadSource(fileUrl);
              hls.attachMedia(videoRef.current);
            }
          } catch {
            /* hls.js 不可用，只显示信息 */
          }
        }

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : '解析 M3U8 失败');
        setLoading(false);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  }, [loadContent, fileUrl, onError]);

  return (
    <div className={`flex flex-col h-full min-h-0 ${className ?? ''}`}>
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-[var(--color-secondary)]">
        <Film className="w-4 h-4 text-pink-400" />
        <span className="text-xs font-medium">{fileName}</span>
        {info && (
          <span className="text-xs text-muted-foreground">
            {info.isMasterPlaylist ? '主播放列表' : `${info.segments.length} 段 · ${formatDuration(info.totalDuration)}`}
          </span>
        )}
        <div className="flex-1" />
        <button onClick={() => setShowRaw(!showRaw)} className="text-xs text-muted-foreground hover:text-foreground px-2">
          {showRaw ? '信息' : '源码'}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading && <p className="text-sm text-muted-foreground">解析中...</p>}
        {error && (
          <div className="flex flex-col items-center gap-2">
            <AlertTriangle className="w-8 h-8 text-orange-500" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {info && showRaw && (
          <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/20 p-3 rounded">
            {info.raw}
          </pre>
        )}

        {info && !showRaw && (
          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="text-xs text-muted-foreground space-y-0.5">
              {info.version && <div>HLS 版本：{info.version}</div>}
              {info.targetDuration && <div>目标时长：{info.targetDuration}s</div>}
              {info.isMasterPlaylist && <div>类型：多码率主播放列表</div>}
            </div>

            {/* 子流（主播放列表） */}
            {info.streams.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">可用码率</h4>
                {info.streams.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-1.5 bg-muted/20 rounded mb-1 text-xs">
                    <Play className="w-3 h-3 text-pink-400" />
                    <span>{(s.bandwidth / 1000000).toFixed(1)} Mbps</span>
                    {s.resolution && <span>{s.resolution}</span>}
                    {s.codecs && <span className="text-muted-foreground">{s.codecs}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* 分段信息 */}
            {info.segments.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  分段（{info.segments.length}）
                </h4>
                <div className="space-y-0.5 max-h-[300px] overflow-auto">
                  {info.segments.slice(0, 50).map((seg, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1 text-xs bg-muted/10 rounded">
                      <span className="text-muted-foreground w-6 text-right">#{i + 1}</span>
                      <span>{formatDuration(seg.duration)}</span>
                      <span className="text-muted-foreground truncate flex-1">{seg.uri}</span>
                    </div>
                  ))}
                  {info.segments.length > 50 && (
                    <div className="text-xs text-muted-foreground px-2 py-1">
                      ...还有 {info.segments.length - 50} 段
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 尝试播放 */}
            {!info.isMasterPlaylist && fileUrl && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">播放器</h4>
                <video
                  ref={videoRef}
                  controls
                  className="w-full max-h-[300px] rounded bg-black"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
