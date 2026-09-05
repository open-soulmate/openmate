'use client';

/**
 * SHP 形状文件渲染器
 *
 * 功能：
 * - 解析 .shp 形状文件（ESRI Shapefile）
 * - 渲染为 Leaflet 地图图层
 * - 支持 Point/Polyline/Polygon
 * - 自动 fitBounds
 * - 暗色/亮色底图切换
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ZoomIn, ZoomOut, Maximize2, Minimize2, Layers, AlertTriangle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ShpRendererProps {
  fileName: string;
  fileUrl?: string;
  fileBuffer?: ArrayBuffer;
  onError?: (err: Error) => void;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  底图配置                                                           */
/* ------------------------------------------------------------------ */

const LIGHT_TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const LIGHT_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const DARK_TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_ATTR = '&copy; OpenStreetMap &copy; CARTO';

/* ------------------------------------------------------------------ */
/*  SHP 渲染器                                                         */
/* ------------------------------------------------------------------ */

export function ShpRenderer({ fileName, fileUrl, fileBuffer, onError, className }: ShpRendererProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<unknown>(null);
  const tileRef = useRef<unknown>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [featureCount, setFeatureCount] = useState(0);

  /* 加载文件 */
  const loadBuffer = useCallback(async (): Promise<ArrayBuffer> => {
    if (fileBuffer) return fileBuffer;
    if (fileUrl) { const r = await fetch(fileUrl); return r.arrayBuffer(); }
    throw new Error('未提供文件内容');
  }, [fileUrl, fileBuffer]);

  useEffect(() => {
    let disposed = false;
    const container = mapRef.current;
    if (!container) return;

    (async () => {
      try {
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        const shp = await import('shapefile');

        if (disposed) return;
        const buf = await loadBuffer();

        /* shapefile 库需要 .shp 和 .dbf 两个文件，但只传 shp 也能解析几何 */
        const geojson = await shp.read(buf);

        /* 初始化地图 */
        const isDark = document.documentElement.classList.contains('dark');
        setDarkMode(isDark);

        const map = L.map(container, { center: [35, 105], zoom: 4, zoomControl: false });
        const tile = L.tileLayer(isDark ? DARK_TILE : LIGHT_TILE, {
          attribution: isDark ? DARK_ATTR : LIGHT_ATTR, maxZoom: 19,
        }).addTo(map);

        leafletMap.current = map;
        tileRef.current = tile;

        /* 渲染 GeoJSON */
        let count = 0;
        const layer = L.geoJSON(geojson as unknown as GeoJSON.FeatureCollection, {
          style: { color: '#3b82f6', weight: 2, fillOpacity: 0.3 },
          onEachFeature: (feature, layer) => {
            count++;
            const props = feature.properties;
            if (props) {
              const entries = Object.entries(props).slice(0, 10);
              if (entries.length > 0) {
                const html = entries.map(([k, v]) => `<b>${k}:</b> ${v}`).join('<br/>');
                layer.bindPopup(html);
              }
            }
          },
        }).addTo(map);

        setFeatureCount(count);

        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
        setTimeout(() => { if (!disposed) map.invalidateSize(); }, 100);
        setLoading(false);
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : '加载 SHP 失败');
          setLoading(false);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    return () => {
      disposed = true;
      if (leafletMap.current) { (leafletMap.current as L.Map).remove(); leafletMap.current = null; }
    };
  }, [loadBuffer, onError]);

  const zoomIn = () => { (leafletMap.current as L.Map)?.zoomIn(); };
  const zoomOut = () => { (leafletMap.current as L.Map)?.zoomOut(); };
  const toggleFullscreen = () => {
    const el = mapRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) { el.requestFullscreen(); setIsFullscreen(true); }
    else { document.exitFullscreen(); setIsFullscreen(false); }
  };
  const toggleDark = async () => {
    const L = await import('leaflet');
    const nd = !darkMode; setDarkMode(nd);
    const m = leafletMap.current as L.Map;
    const old = tileRef.current as L.TileLayer;
    if (m && old) {
      m.removeLayer(old);
      const t = L.tileLayer(nd ? DARK_TILE : LIGHT_TILE, { attribution: nd ? DARK_ATTR : LIGHT_ATTR, maxZoom: 19 }).addTo(m);
      tileRef.current = t;
    }
  };

  return (
    <div className={`relative w-full h-full min-h-[400px] ${className ?? ''}`}>
      <div ref={mapRef} className="w-full h-full rounded-lg" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-[1000]">
          <div className="text-sm text-muted-foreground">加载 SHP 中...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 z-[1000]">
          <AlertTriangle className="w-8 h-8 text-orange-500" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      )}
      {!loading && !error && (
        <div className="absolute top-2 right-2 z-[1000] flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-lg p-1 border border-border shadow-sm">
          <span className="text-xs text-muted-foreground px-2">SHP · {featureCount} 要素</span>
          <div className="w-px h-4 bg-border" />
          <button onClick={zoomIn} className="p-1.5 hover:bg-accent rounded"><ZoomIn className="w-4 h-4" /></button>
          <button onClick={zoomOut} className="p-1.5 hover:bg-accent rounded"><ZoomOut className="w-4 h-4" /></button>
          <button onClick={toggleDark} className="p-1.5 hover:bg-accent rounded"><Layers className="w-4 h-4" /></button>
          <button onClick={toggleFullscreen} className="p-1.5 hover:bg-accent rounded">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
