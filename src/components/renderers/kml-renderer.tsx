'use client';

/**
 * KML 地理数据渲染器
 *
 * 功能：
 * - 解析 KML XML（Google Earth 格式）
 * - 提取 Placemark 元素（Point/LineString/Polygon）
 * - 用 Leaflet 在地图上渲染
 * - 支持 Folder 分组、名称显示
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

interface KmlRendererProps {
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
/*  KML 坐标解析                                                       */
/* ------------------------------------------------------------------ */

/** 解析 KML 坐标字符串 → [lon, lat, alt][] */
function parseKmlCoordinates(coordText: string): [number, number, number?][] {
  const coords: [number, number, number?][] = [];
  const lines = coordText.trim().split(/\s+/);
  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      const alt = parts[2] ? parseFloat(parts[2]) : undefined;
      if (!isNaN(lon) && !isNaN(lat)) {
        coords.push([lon, lat, alt]);
      }
    }
  }
  return coords;
}

/* ------------------------------------------------------------------ */
/*  KML 渲染器主组件                                                   */
/* ------------------------------------------------------------------ */

export function KmlRenderer({
  fileName,
  fileUrl,
  fileBuffer,
  onError,
  className,
}: KmlRendererProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const tileLayerRef = useRef<unknown>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placemarkCount, setPlacemarkCount] = useState(0);

  /* 加载文件内容 */
  const loadFileContent = useCallback(async (): Promise<string> => {
    if (fileBuffer) {
      return new TextDecoder().decode(fileBuffer);
    }
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
        /* 动态导入 Leaflet */
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');

        if (disposed) return;

        const content = await loadFileContent();

        /* 解析 KML XML */
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/xml');
        const parseError = doc.querySelector('parsererror');
        if (parseError) {
          throw new Error('KML 文件格式错误：XML 解析失败');
        }

        /* 检查是否为 KML */
        const kmlRoot = doc.querySelector('kml') || doc.querySelector('Document');
        if (!kmlRoot) {
          throw new Error('不是有效的 KML 文件（缺少 kml 根元素）');
        }

        /* 初始化地图 */
        const isDark = document.documentElement.classList.contains('dark');
        setDarkMode(isDark);

        const tileUrl = isDark ? DARK_TILE_URL : LIGHT_TILE_URL;
        const tileAttr = isDark ? DARK_TILE_ATTR : LIGHT_TILE_ATTR;

        const map = L.map(container, {
          center: [35, 105],
          zoom: 4,
          zoomControl: false,
        });

        const tile = L.tileLayer(tileUrl, {
          attribution: tileAttr,
          maxZoom: 19,
        }).addTo(map);

        mapRef.current = map;
        tileLayerRef.current = tile;

        /* 递归提取所有 Placemark */
        let count = 0;
        const bounds = L.latLngBounds([]);

        function processPlacemark(pm: Element) {
          const name = pm.querySelector('name')?.textContent || '';

          /* Point */
          const point = pm.querySelector('Point > coordinates');
          if (point) {
            const coords = parseKmlCoordinates(point.textContent || '');
            if (coords.length > 0) {
              const [lon, lat] = coords[0];
              const marker = L.circleMarker([lat, lon], {
                radius: 6,
                color: '#3b82f6',
                fillColor: '#60a5fa',
                fillOpacity: 0.8,
              });
              if (name) marker.bindPopup(`<b>${name}</b>`);
              (map as L.Map).addLayer(marker);
              bounds.extend([lat, lon]);
              count++;
            }
          }

          /* LineString */
          const line = pm.querySelector('LineString > coordinates');
          if (line) {
            const coords = parseKmlCoordinates(line.textContent || '');
            if (coords.length > 1) {
              const latlngs = coords.map(([lon, lat]) => L.latLng(lat, lon));
              const polyline = L.polyline(latlngs, {
                color: '#3b82f6',
                weight: 3,
                opacity: 0.8,
              });
              if (name) polyline.bindPopup(`<b>${name}</b>`);
              (map as L.Map).addLayer(polyline);
              latlngs.forEach((ll) => bounds.extend(ll));
              count++;
            }
          }

          /* Polygon */
          const polygon = pm.querySelector('Polygon > outerBoundaryIs > LinearRing > coordinates');
          if (polygon) {
            const coords = parseKmlCoordinates(polygon.textContent || '');
            if (coords.length > 2) {
              const latlngs = coords.map(([lon, lat]) => L.latLng(lat, lon));
              const poly = L.polygon(latlngs, {
                color: '#10b981',
                fillColor: '#34d399',
                fillOpacity: 0.3,
                weight: 2,
              });
              if (name) poly.bindPopup(`<b>${name}</b>`);
              (map as L.Map).addLayer(poly);
              latlngs.forEach((ll) => bounds.extend(ll));
              count++;
            }
          }
        }

        /* 递归处理 Folder 和 Document */
        function processContainer(container: Element) {
          const placemarks = container.querySelectorAll(':scope > Placemark');
          placemarks.forEach(processPlacemark);
          const folders = container.querySelectorAll(':scope > Folder, :scope > Document');
          folders.forEach(processContainer);
        }

        processContainer(kmlRoot);
        setPlacemarkCount(count);

        /* 自动缩放到数据范围 */
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [30, 30] });
        }

        setTimeout(() => { if (!disposed) map.invalidateSize(); }, 100);
        setLoading(false);
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : '加载 KML 失败');
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

  /* 缩放控制 */
  const zoomIn = () => { (mapRef.current as L.Map)?.zoomIn(); };
  const zoomOut = () => { (mapRef.current as L.Map)?.zoomOut(); };

  /* 全屏切换 */
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

  /* 底图切换 */
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
          <div className="text-sm text-muted-foreground">加载 KML 中...</div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 z-[1000]">
          <AlertTriangle className="w-8 h-8 text-orange-500" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {/* 工具栏 */}
      {!loading && !error && (
        <div className="absolute top-2 right-2 z-[1000] flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-lg p-1 border border-border shadow-sm">
          <span className="text-xs text-muted-foreground px-2">
            KML · {placemarkCount} 个要素
          </span>
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
