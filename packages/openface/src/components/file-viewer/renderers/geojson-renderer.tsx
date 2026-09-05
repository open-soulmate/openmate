'use client';

/**
 * GeoJSON 地理数据渲染器
 *
 * 功能：
 * - 动态导入 Leaflet（SSR 兼容）
 * - 加载 OpenStreetMap / CartoDB Dark 瓦片底图
 * - 解析并渲染 GeoJSON 数据（支持所有几何类型）
 * - 自动 fitBounds 到数据范围
 * - 点击要素显示属性弹窗（Popup）
 * - 工具栏：缩放、全屏、图层切换
 * - 暗色/亮色主题自动适配
 * - 错误处理（非 GeoJSON 格式）
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

interface GeojsonRendererProps {
  /** 文件名 */
  fileName: string;
  /** 文件内容 data URL 或 blob URL */
  fileUrl?: string;
  /** 文件内容 ArrayBuffer */
  fileBuffer?: ArrayBuffer;
  /** 错误回调 */
  onError?: (err: Error) => void;
  /** 额外 className */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  验证 GeoJSON 格式                                                  */
/* ------------------------------------------------------------------ */

/**
 * 简单验证 JSON 是否为合法的 GeoJSON 结构
 * 支持: Point, MultiPoint, LineString, MultiLineString,
 *       Polygon, MultiPolygon, GeometryCollection, Feature, FeatureCollection
 */
function isValidGeoJSON(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  const validTypes = [
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
    'GeometryCollection',
    'Feature',
    'FeatureCollection',
  ];
  return typeof obj.type === 'string' && validTypes.includes(obj.type);
}

/* ------------------------------------------------------------------ */
/*  获取当前主题（暗色/亮色）                                            */
/* ------------------------------------------------------------------ */

/** 检测当前页面是否为暗色主题 */
function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    document.documentElement.classList.contains('dark') ||
    document.documentElement.getAttribute('data-theme') === 'dark' ||
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/* ------------------------------------------------------------------ */
/*  底图图层配置                                                       */
/* ------------------------------------------------------------------ */

/** 亮色底图（OpenStreetMap） */
const LIGHT_TILE_URL =
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const LIGHT_TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** 暗色底图（CartoDB Dark） */
const DARK_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

/* ------------------------------------------------------------------ */
/*  GeoJSON 渲染器主组件                                               */
/* ------------------------------------------------------------------ */

export function GeojsonRenderer({
  fileName,
  fileUrl,
  fileBuffer,
  onError,
  className,
}: GeojsonRendererProps) {
  /* 地图容器引用 */
  const mapContainerRef = useRef<HTMLDivElement>(null);
  /* Leaflet 地图实例引用 */
  const mapRef = useRef<unknown>(null);
  /* 当前底图图层引用 */
  const tileLayerRef = useRef<unknown>(null);
  /* GeoJSON 图层引用 */
  const geojsonLayerRef = useRef<unknown>(null);

  /* 状态：是否全屏 */
  const [isFullscreen, setIsFullscreen] = useState(false);
  /* 状态：当前是否暗色主题 */
  const [darkMode, setDarkMode] = useState(false);
  /* 状态：加载中 */
  const [loading, setLoading] = useState(true);
  /* 状态：错误信息 */
  const [error, setError] = useState<string | null>(null);
  /* 状态：要素数量 */
  const [featureCount, setFeatureCount] = useState(0);

  /* -------------------------------------------------------------- */
  /*  加载文件数据                                                    */
  /* -------------------------------------------------------------- */

  /** 从 fileUrl 或 fileBuffer 加载 GeoJSON 数据 */
  const loadGeoJSONData = useCallback(async (): Promise<unknown> => {
    let text: string;

    if (fileBuffer) {
      /* 从 ArrayBuffer 解码 */
      text = new TextDecoder().decode(fileBuffer);
    } else if (fileUrl) {
      /* 从 URL 获取 */
      const resp = await fetch(fileUrl);
      if (!resp.ok) throw new Error(`加载文件失败: ${resp.status}`);
      text = await resp.text();
    } else {
      throw new Error('未提供文件数据（fileUrl 或 fileBuffer）');
    }

    /* 解析 JSON */
    const data = JSON.parse(text);

    /* 验证 GeoJSON 格式 */
    if (!isValidGeoJSON(data)) {
      throw new Error(
        '不是有效的 GeoJSON 格式（缺少 type 字段或 type 不合法）'
      );
    }

    return data;
  }, [fileUrl, fileBuffer]);

  /* -------------------------------------------------------------- */
  /*  初始化地图                                                      */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      try {
        setLoading(true);
        setError(null);

        /* 动态导入 Leaflet（SSR 安全） */
        const L = await import('leaflet');

        /* 动态加载 Leaflet CSS */
        if (!document.querySelector('link[href*="leaflet.css"]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        if (cancelled || !mapContainerRef.current) return;

        /* 检测主题 */
        const dark = isDarkTheme();
        if (cancelled) return;
        setDarkMode(dark);

        /* 创建地图实例 */
        const map = L.map(mapContainerRef.current, {
          center: [35.8617, 104.1954], /* 默认中心：中国 */
          zoom: 4,
          zoomControl: false, /* 使用自定义工具栏 */
          attributionControl: true,
        });

        /* 添加底图图层 */
        const tileUrl = dark ? DARK_TILE_URL : LIGHT_TILE_URL;
        const tileAttr = dark ? DARK_TILE_ATTR : LIGHT_TILE_ATTR;
        const tileLayer = L.tileLayer(tileUrl, {
          attribution: tileAttr,
          maxZoom: 19,
        }).addTo(map);

        /* 保存引用 */
        mapRef.current = map;
        tileLayerRef.current = tileLayer;

        /* 加载并渲染 GeoJSON 数据 */
        const data = await loadGeoJSONData();
        if (cancelled) return;

        /* 创建 GeoJSON 图层，带弹窗回调 */
        const geojsonLayer = L.geoJSON(data as Parameters<typeof L.geoJSON>[0], {
          /* 点击要素弹出属性信息 */
          onEachFeature: (feature, layer) => {
            if (feature.properties) {
              const props = feature.properties;
              /* 构建属性表格 HTML */
              const rows = Object.entries(props)
                .map(
                  ([key, value]) =>
                    `<tr><td style="padding:2px 8px;font-weight:600;color:#555;white-space:nowrap;">${key}</td><td style="padding:2px 8px;">${String(value)}</td></tr>`
                )
                .join('');
              const popupContent = `
                <div style="max-height:200px;overflow:auto;font-size:12px;">
                  <table style="border-collapse:collapse;width:100%;">
                    ${rows}
                  </table>
                </div>
              `;
              layer.bindPopup(popupContent);
            }
          },
          /* 点样式 */
          pointToLayer: (_feature, latlng) => {
            return L.circleMarker(latlng, {
              radius: 6,
              fillColor: '#3b82f6',
              color: '#1d4ed8',
              weight: 2,
              opacity: 1,
              fillOpacity: 0.7,
            });
          },
        }).addTo(map);

        geojsonLayerRef.current = geojsonLayer;

        /* 自动缩放到数据范围 */
        try {
          const bounds = geojsonLayer.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [20, 20] });
          }
        } catch {
          /* 如果 getBounds 失败（例如只有单个点），忽略 */
        }

        /* 统计要素数量 */
        let count = 0;
        geojsonLayer.eachLayer(() => count++);
        setFeatureCount(count);

        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : '加载 GeoJSON 失败';
        setError(msg);
        setLoading(false);
        onError?.(err instanceof Error ? err : new Error(msg));
      }
    }

    initMap();

    return () => {
      cancelled = true;
      /* 清理地图实例 */
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }
    };
  }, [loadGeoJSONData, onError]);

  /* -------------------------------------------------------------- */
  /*  工具栏操作                                                      */
  /* -------------------------------------------------------------- */

  /** 放大 */
  const handleZoomIn = useCallback(() => {
    if (mapRef.current) {
      (mapRef.current as { zoomIn: () => void }).zoomIn();
    }
  }, []);

  /** 缩小 */
  const handleZoomOut = useCallback(() => {
    if (mapRef.current) {
      (mapRef.current as { zoomOut: () => void }).zoomOut();
    }
  }, []);

  /** 全屏切换 */
  const handleToggleFullscreen = useCallback(() => {
    if (!mapContainerRef.current) return;
    const container = mapContainerRef.current.closest(
      '[data-geojson-wrapper]'
    );
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false));
    }
  }, []);

  /** 切换底图（暗色/亮色） */
  const handleToggleLayer = useCallback(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    const L = (window as unknown as Record<string, unknown>).L;
    if (!L) return;

    const map = mapRef.current as {
      removeLayer: (layer: unknown) => void;
      addLayer: (layer: unknown) => void;
    };
    /* 移除旧图层 */
    map.removeLayer(tileLayerRef.current);

    /* 创建新图层 */
    const newDark = !darkMode;
    const tileUrl = newDark ? DARK_TILE_URL : LIGHT_TILE_URL;
    const tileAttr = newDark ? DARK_TILE_ATTR : LIGHT_TILE_ATTR;
    const newTile = (
      L as unknown as {
        tileLayer: (
          url: string,
          opts: Record<string, unknown>
        ) => { addTo: (map: unknown) => unknown };
      }
    ).tileLayer(tileUrl, {
      attribution: tileAttr,
      maxZoom: 19,
    });
    newTile.addTo(mapRef.current);
    tileLayerRef.current = newTile;
    setDarkMode(newDark);
  }, [darkMode]);

  /* -------------------------------------------------------------- */
  /*  全屏变化监听                                                    */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  /* -------------------------------------------------------------- */
  /*  渲染                                                            */
  /* -------------------------------------------------------------- */

  return (
    <div
      data-geojson-wrapper
      className={`flex flex-col h-full min-h-0 ${className ?? ''}`}
    >
      {/* 工具栏 */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
        {/* 格式标签 */}
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400">
          GEOJSON
        </span>

        {/* 要素数量 */}
        {!loading && !error && featureCount > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400">
            {featureCount} 个要素
          </span>
        )}

        <div className="flex-1" />

        {/* 文件名 */}
        <span className="text-[10px] text-muted-foreground/50 truncate max-w-[200px]">
          {fileName}
        </span>

        {/* 工具按钮 */}
        <div className="flex items-center gap-0.5 ml-2">
          <button
            onClick={handleZoomIn}
            className="p-1 rounded hover:bg-muted/30 text-muted-foreground/70 hover:text-foreground transition-colors"
            title="放大"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1 rounded hover:bg-muted/30 text-muted-foreground/70 hover:text-foreground transition-colors"
            title="缩小"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleToggleLayer}
            className="p-1 rounded hover:bg-muted/30 text-muted-foreground/70 hover:text-foreground transition-colors"
            title={darkMode ? '切换到亮色底图' : '切换到暗色底图'}
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleToggleFullscreen}
            className="p-1 rounded hover:bg-muted/30 text-muted-foreground/70 hover:text-foreground transition-colors"
            title={isFullscreen ? '退出全屏' : '全屏'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 地图容器 */}
      <div className="flex-1 relative min-h-0">
        {/* 地图 div（Leaflet 挂载点） */}
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* 加载中遮罩 */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-[1000]">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">
                加载 GeoJSON 数据中…
              </span>
            </div>
          </div>
        )}

        {/* 错误遮罩 */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/90 z-[1000]">
            <div className="flex flex-col items-center gap-3 max-w-md text-center p-6">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground mb-1">
                  GeoJSON 渲染失败
                </h3>
                <p className="text-xs text-muted-foreground">{error}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  文件：{fileName}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
