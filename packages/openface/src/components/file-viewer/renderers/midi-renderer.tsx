'use client';

/**
 * MIDI 音乐渲染器
 *
 * 功能：
 * - 解析 MIDI 文件头（格式类型、轨道数、时间分辨率）
 * - 显示轨道列表（名称、事件数、时长）
 * - 基础信息展示
 */

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Music } from 'lucide-react';

interface MidiRendererProps {
  fileName: string;
  fileUrl?: string;
  fileBuffer?: ArrayBuffer;
  onError?: (err: Error) => void;
  className?: string;
}

interface MidiInfo {
  format: number;
  trackCount: number;
  ticksPerBeat: number;
  tracks: { name: string; eventCount: number; durationTicks: number }[];
}

/** 读取大端 Uint16 */
function readU16(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

/** 读取大端 Uint32 */
function readU32(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
}

/** 读取可变长度数值 */
function readVarLen(buf: Uint8Array, offset: number): { value: number; nextOffset: number } {
  let value = 0;
  let i = offset;
  while (i < buf.length) {
    const byte = buf[i];
    value = (value << 7) | (byte & 0x7F);
    i++;
    if ((byte & 0x80) === 0) break;
  }
  return { value, nextOffset: i };
}

function parseMidi(buf: ArrayBuffer): MidiInfo {
  const data = new Uint8Array(buf);

  /* 验证 "MThd" */
  if (data[0] !== 0x4D || data[1] !== 0x54 || data[2] !== 0x68 || data[3] !== 0x64) {
    throw new Error('不是有效的 MIDI 文件');
  }

  const format = readU16(data, 8);
  const trackCount = readU16(data, 10);
  const ticksPerBeat = readU16(data, 12);

  const tracks: MidiInfo['tracks'] = [];
  let offset = 14;

  for (let t = 0; t < trackCount && offset < data.length; t++) {
    /* 寻找 "MTrk" */
    while (offset < data.length - 8) {
      if (data[offset] === 0x4D && data[offset + 1] === 0x54 &&
          data[offset + 2] === 0x72 && data[offset + 3] === 0x6B) break;
      offset++;
    }

    const trackLen = readU32(data, offset + 4);
    offset += 8;
    const trackEnd = offset + trackLen;

    let eventCount = 0;
    let currentTick = 0;
    let trackName = `轨道 ${t + 1}`;

    /* 扫描事件 */
    while (offset < trackEnd && offset < data.length) {
      const { value: delta, nextOffset } = readVarLen(data, offset);
      offset = nextOffset;
      currentTick += delta;
      eventCount++;

      if (offset >= data.length) break;
      const status = data[offset];

      /* Meta Event */
      if (status === 0xFF) {
        const metaType = data[offset + 1];
        const { value: metaLen, nextOffset: metaNext } = readVarLen(data, offset + 2);
        offset = metaNext;

        if (metaType === 0x03 && metaLen > 0) {
          /* Track Name */
          trackName = new TextDecoder().decode(data.slice(offset, offset + metaLen)) || trackName;
        }
        offset += metaLen;
      } else if (status === 0xF0 || status === 0xF7) {
        /* SysEx */
        const { value: sysexLen, nextOffset: sysexNext } = readVarLen(data, offset + 1);
        offset = sysexNext + sysexLen;
      } else {
        /* MIDI 事件 */
        offset += (status & 0xF0) === 0xC0 || (status & 0xF0) === 0xD0 ? 2 : 3;
      }
    }

    tracks.push({ name: trackName, eventCount, durationTicks: currentTick });
    offset = Math.min(trackEnd, data.length);
  }

  return { format, trackCount, ticksPerBeat, tracks };
}

function formatTicks(ticks: number, ticksPerBeat: number): string {
  const beats = ticks / ticksPerBeat;
  const bars = Math.floor(beats / 4) + 1;
  const beat = Math.floor(beats % 4) + 1;
  return `${bars}:${beat}`;
}

export function MidiRenderer({ fileName, fileUrl, fileBuffer, onError, className }: MidiRendererProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<MidiInfo | null>(null);

  const loadBuffer = useCallback(async (): Promise<ArrayBuffer> => {
    if (fileBuffer) return fileBuffer;
    if (fileUrl) { const r = await fetch(fileUrl); return r.arrayBuffer(); }
    throw new Error('未提供文件内容');
  }, [fileUrl, fileBuffer]);

  useEffect(() => {
    (async () => {
      try {
        const buf = await loadBuffer();
        const midi = parseMidi(buf);
        setInfo(midi);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : '解析 MIDI 失败');
        setLoading(false);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  }, [loadBuffer, onError]);

  return (
    <div className={`flex flex-col h-full min-h-0 ${className ?? ''}`}>
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-[var(--color-secondary)]">
        <Music className="w-4 h-4 text-yellow-400" />
        <span className="text-xs font-medium">{fileName}</span>
        {info && (
          <span className="text-xs text-muted-foreground">
            格式 {info.format} · {info.trackCount} 轨道 · {info.ticksPerBeat} ticks/拍
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading && <p className="text-sm text-muted-foreground">解析中...</p>}
        {error && (
          <div className="flex flex-col items-center gap-2">
            <AlertTriangle className="w-8 h-8 text-orange-500" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {info && (
          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>MIDI 格式：Type {info.format}（{info.format === 0 ? '单轨' : info.format === 1 ? '多轨同步' : '多轨独立'}）</div>
              <div>时间分辨率：{info.ticksPerBeat} ticks / 四分音符</div>
            </div>

            {/* 轨道列表 */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">轨道列表</h4>
              {info.tracks.map((track, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 bg-muted/20 rounded mb-1">
                  <Music className="w-4 h-4 text-yellow-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{track.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {track.eventCount} 事件 · {formatTicks(track.durationTicks, info.ticksPerBeat)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground/50 italic">
              注：当前仅解析 MIDI 文件结构，播放功能需集成 Tone.js 或 Web MIDI API。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
