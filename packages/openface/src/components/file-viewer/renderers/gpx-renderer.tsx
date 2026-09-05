'use client';

/**
 * GPX 轨迹渲染器
 *
 * 功能：
 * - 解析 GPX XML（GPS 轨迹格式）
 * - 渲染轨迹线（trk）+ 航点（wpt）+ 路线（rte）
 * - 显示统计信息：总距离、最高/最低海拔、点数
 * - 暗色/亮色底图切换
 * - 缩放/拖拽/全屏
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Layers,
  AlertTriangle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Props 定义                                                         */
/* ------------------------------------------------------------------ */

interface GpxRendererProps {
  fileName: string;
  fileUrl?: string;
  fileBuffer?: ArrayBuffer;
  onError?: (err: Error) => void;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  底图配置                                                           */
/* ------------------------------------------------------------------ */

const LIGHT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const LIGHT_TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

/* ------------------------------------------------------------------ */
/*  GPX 统计计算                                                       */
/* ------------------------------------------------------------------ */

/** Haversine 公式计算两点间距离（米） */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface GpxStats {
  totalDistance: number;    // 总距离（米）
  totalPoints: number;     // 总点数
  maxElevation: number;    // 最高海拔
  minElevation: number;    // 最低海拔
  startTime?: string;      // 开始时间
  endTime?: string;        // 结束时间
}

/* ------------------------------------------------------------------ */
/*  GPX 渲染器主组件                                                   */
/* ------------------------------------------------------------------ */

export function GpxRenderer({
  fileName,
  fileUrl,
  fileBuffer,
  onError,
  className,
}: GpxRendererProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const tileLayerRef = useRef<unknown>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<GpxStats | null>(null);

  /* 加载文件内容 */
  const loadFileContent = useCallback(async (): Promise<string> => {
    if (fileBuffer) return new TextDecoder().decode(fileBuffer);
    if (fileUrl) {
      const resp = await fetch(fileUrl);
      return resp.text();
    }
    throw new Error('未提供文件内容');
  }, [fileUrl, fileBuffer]);

  /* 初始化地图 */
  useEffect(() => {
    let disposed = false;
    const container = mapContainerRef.current;
    if (!container) return;

    (async () => {
      try {
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');

        if (disposed) return;
        const content = await loadFileContent();

        /* 解析 GPX XML */
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/xml');
        const parseError = doc.querySelector('parsererror');
        if (parseError) throw new Error('GPX 文件格式错误：XML 解析失败');

        const gpxRoot = doc.querySelector('gpx');
        if (!gpxRoot) throw new Error('不是有效的 GPX 文件（缺少 gpx 根元素）');

        /* 初始化地图 */
        const isDark = document.documentElement.classList.contains('dark');
        setDarkMode(isDark);

        const map = L.map(container, {
          center: [35, 105],
          zoom: 4,
          zoomControl: false,
        });

        const tile = L.tileLayer(isDark ? DARK_TILE_URL : LIGHT_TILE_URL, {
          attribution: isDark ? DARK_TILE_ATTR : LIGHT_TILE_ATTR,
          maxZoom: 19,
        }).addTo(map);

        mapRef.current = map;
        tileLayerRef.current = tile;

        const bounds = L.latLngBounds([]);
        let totalDistance = 0;
        let totalPoints = 0;
        let maxEle = -Infinity;
        let minEle = Infinity;
        let startTime: string | undefined;
        let endTime: string | undefined;

        /* 渲染轨迹（trk） */
        const tracks = gpxRoot.querySelectorAll('trk');
        tracks.forEach((trk) => {
          const trkName = trk.querySelector('name')?.textContent || '';
          const segments = trk.querySelectorAll('trkseg');
          segments.forEach((seg) => {
            const pts = seg.querySelectorAll('trkpt');
            const latlngs: L.LatLng[] = [];

            pts.forEach((pt, i) => {
              const lat = parseFloat(pt.getAttribute('lat') || '0');
              const lon = parseFloat(pt.getAttribute('lon') || '0');
              if (isNaN(lat) || isNaN(lon)) return;

              const ele = pt.querySelector('ele')?.textContent;
              const time = pt.querySelector('time')?.textContent;

              if (ele) {
                const e = parseFloat(ele);
                if (!isNaN(e)) {
                  maxEle = Math.max(maxEle, e);
                  minEle = Math.min(minEle, e);
                }
              }
              if (i === 0 && time) startTime = time;
              if (i === pts.length - 1 && time) endTime = time;

              latlngs.push(L.latLng(lat, lon));
              totalPoints++;

              if (i > 0) {
                totalDistance += haversineDistance(
                  latlngs[i - 1].lat, latlngs[i - 1].lng, lat, lon
                );
              }
            });

            if (latlngs.length > 1) {
              const polyline = L.polyline(latlngs, {
                color: '#3b82f6',
                weight: 4,
                opacity: 0.8,
              });
              if (trkName) polyline.bindPopup(`<b>${trkName}</b><br/>${latlngs.length} 个点`);
              (map as L.Map).addLayer(polyline);
              latlngs.forEach((ll) => bounds.extend(ll));
            }
          });
        });

        /* 渲染航点（wpt） */
        const waypoints = gpxRoot.querySelectorAll('wpt');
        waypoints.forEach((wpt) => {
          const lat = parseFloat(wpt.getAttribute('lat') || '0');
          const lon = parseFloat(wpt.getAttribute('lon') || '0');
          if (isNaN(lat) || isNaN(lon)) return;

          const name = wpt.querySelector('name')?.textContent || '航点';
          const ele = wpt.querySelector('ele')?.textContent;

          const marker = L.circleMarker([lat, lon], {
            radius: 7,
            color: '#10b981',
            fillColor: '#34d399',
            fillOpacity: 0.9,
          });
          let popup = `<b>${name}</b>`;
          if (ele) popup += `<br/>海拔: ${parseFloat(ele).toFixed(0)}m`;
          marker.bindPopup(popup);
          (map as L.Map).addLayer(marker);
          bounds.extend([lat, lon]);
        });

        /* 渲染路线（rte） */
        const routes = gpxRoot.querySelectorAll('rte');
        routes.forEach((rte) => {
          const rteName = rte.querySelector('name')?.textContent || '';
          const rtepts = rte.querySelectorAll('rtept');
          const latlngs: L.LatLng[] = [];
          rtepts.forEach((pt) => {
            const lat = parseFloat(pt.getAttribute('lat') || '0');
            const lon = parseFloat(pt.getAttribute('lon') || '0');
            if (!isNaN(lat) && !isNaN(lon)) latlngs.push(L.latLng(lat, lon));
          });
          if (latlngs.length > 1) {
            const polyline = L.polyline(latlngs, {
              color: '#f59e0b',
              weight: 4,
              opacity: 0.8,
              dashArray: '8 4',
            });
            if (rteName) polyline.bindPopup(`<b>${rteName}</b>`);
            (map as L.Map).addLayer(polyline);
            latlngs.forEach((ll) => bounds.extend(ll));
          }
        });

        setStats({
          totalDistance,
          totalPoints,
          maxElevation: maxEle === -Infinity ? 0 : maxEle,
          minElevation: minEle === Infinity ? 0 : minEle,
          startTime,
          endTime,
        });

        if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
        setTimeout(() => { if (!disposed) map.invalidateSize(); }, 100);
        setLoading(false);
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : '加载 GPX 失败');
          setLoading(false);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    return () => {
      disposed = true;
      if (mapRef.current) {
        (mapRef.current as L.Map).remove();
        mapRef.current = null;
      }
    };
  }, [loadFileContent, onError]);

  const zoomIn = () => { (mapRef.current as L.Map)?.zoomIn(); };
  const zoomOut = () => { (mapRef.current as L.Map)?.zoomOut(); };

  const toggleFullscreen = () => {
    const container = mapContainerRef.current?.parentElement;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const toggleDarkMode = async () => {
    const L = await import('leaflet');
    const newDark = !darkMode;
    setDarkMode(newDark);
    const map = mapRef.current as L.Map;
    const oldTile = tileLayerRef.current as L.TileLayer;
    if (map && oldTile) {
      map.removeLayer(oldTile);
      const newTile = L.tileLayer(
        newDark ? DARK_TILE_URL : LIGHT_TILE_URL,
        { attribution: newDark ? DARK_TILE_ATTR : LIGHT_TILE_ATTR, maxZoom: 19 }
      ).addTo(map);
      tileLayerRef.current = newTile;
    }
  };

  return (
    <div className={`relative w-full h-full min-h-[400px] ${className ?? ''}`}>
      {/* 地图容器 */}
      <div ref={mapContainerRef} className="w-full h-full rounded-lg" />

      {/* 加载遮罩 */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-[1000]">
          <div className="text-sm text-muted-foreground">加载 GPX 轨迹中...</div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 z-[1000]">
          <AlertTriangle className="w-8 h-8 text-orange-500" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {/* 工具栏 + 统计信息 */}
      {!loading && !error && (
        <div className="absolute top-2 right-2 z-[1000] flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-lg p-1 border border-border shadow-sm">
          <span className="text-xs text-muted-foreground px-2">
            GPX · {stats?.totalPoints ?? 0} 点 · {(stats?.totalDistance ?? 0 / 1000).toFixed(1)}km
          </span>
          {stats?.maxElevation ? (
            <span className="text-xs text-muted-foreground px-1">
              ↑{stats.maxElevation.toFixed(0)}m ↓{stats.minElevation.toFixed(0)}m
            </span>
          ) : null}
          <div className="w-px h-4 bg-border" />
          <button onClick={zoomIn} className="p-1.5 hover:bg-accent rounded" title="放大">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={zoomOut} className="p-1.5 hover:bg-accent rounded" title="缩小">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={toggleDarkMode} className="p-1.5 hover:bg-accent rounded" title="切换底图">
            <Layers className="w-4 h-4" />
          </button>
          <button onClick={toggleFullscreen} className="p-1.5 hover:bg-accent rounded" title="全屏">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
