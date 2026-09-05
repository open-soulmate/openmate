'use client';

/**
 * 3D 模型渲染器
 *
 * 功能：
 * - 动态导入 Three.js（SSR 安全）
 * - 根据文件扩展名选择加载器：
 *   - .gltf/.glb → GLTFLoader
 *   - .obj → OBJLoader
 *   - .stl → STLLoader
 *   - .ply → PLYLoader
 * - Three.js 场景：相机 + 灯光 + OrbitControls
 * - 自动居中 + 缩放模型到合适大小
 * - 工具栏：重置视角、线框模式切换、全屏
 * - 暗色/亮色主题（改变背景色）
 * - 错误处理
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  RotateCcw,
  Grid3X3,
  Maximize2,
  Minimize2,
  AlertTriangle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Props 定义                                                         */
/* ------------------------------------------------------------------ */

interface Model3dRendererProps {
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
/*  工具函数                                                           */
/* ------------------------------------------------------------------ */

/**
 * 获取文件扩展名（小写）
 */
function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

/**
 * 自动居中并缩放模型到合适大小
 * 计算模型包围盒，将相机移到合适位置
 */
function fitCameraToModel(
  camera: {
    position: { set: (x: number, y: number, z: number) => void };
    lookAt: (x: number, y: number, z: number) => void;
  },
  controls: {
    target: { set: (x: number, y: number, z: number) => void };
    update: () => void;
  },
  model: { traverse: (fn: (child: unknown) => void) => void }
) {
  // 动态导入 THREE 以获取 Box3 和 Vector3
  import('three').then((THREE) => {
    const box = new THREE.Box3().setFromObject(model as Parameters<typeof THREE.Box3.prototype.setFromObject>[0]);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // 计算模型最大尺寸，用于确定相机距离
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = 50; // 相机视场角
    const cameraDistance = maxDim / (2 * Math.tan((fov * Math.PI) / 360));

    // 设置相机位置（从斜上方观察）
    camera.position.set(
      center.x + cameraDistance * 0.8,
      center.y + cameraDistance * 0.6,
      center.z + cameraDistance * 0.8
    );
    camera.lookAt(center.x, center.y, center.z);

    // 设置控制器目标为模型中心
    controls.target.set(center.x, center.y, center.z);
    controls.update();
  });
}

/* ------------------------------------------------------------------ */
/*  3D 模型渲染器主组件                                                  */
/* ------------------------------------------------------------------ */

export function Model3dRenderer({
  fileName,
  fileUrl,
  fileBuffer,
  onError,
  className,
}: Model3dRendererProps) {
  /* 画布容器引用 */
  const containerRef = useRef<HTMLDivElement>(null);
  /* Three.js 渲染器引用 */
  const rendererRef = useRef<unknown>(null);
  /* Three.js 场景引用 */
  const sceneRef = useRef<unknown>(null);
  /* Three.js 相机引用 */
  const cameraRef = useRef<unknown>(null);
  /* 轨道控制器引用 */
  const controlsRef = useRef<unknown>(null);
  /* 加载的模型引用 */
  const modelRef = useRef<unknown>(null);
  /* 动画帧 ID */
  const animationFrameRef = useRef<number>(0);

  /* 状态：是否全屏 */
  const [isFullscreen, setIsFullscreen] = useState(false);
  /* 状态：当前是否暗色主题 */
  const [darkMode, setDarkMode] = useState(false);
  /* 状态：加载中 */
  const [loading, setLoading] = useState(true);
  /* 状态：错误信息 */
  const [error, setError] = useState<string | null>(null);
  /* 状态：是否显示线框 */
  const [wireframe, setWireframe] = useState(false);

  /* -------------------------------------------------------------- */
  /*  根据扩展名选择加载器并加载模型                                    */
  /* -------------------------------------------------------------- */

  const loadModel = useCallback(
    async (
      scene: InstanceType<typeof import('three').Scene>,
      THREE: typeof import('three')
    ) => {
      const ext = getFileExtension(fileName);
      let model: unknown;

      /* 获取文件数据为 ArrayBuffer */
      let arrayBuffer: ArrayBuffer;

      if (fileBuffer) {
        arrayBuffer = fileBuffer;
      } else if (fileUrl) {
        const resp = await fetch(fileUrl);
        if (!resp.ok) throw new Error(`加载文件失败: ${resp.status}`);
        arrayBuffer = await resp.arrayBuffer();
      } else {
        throw new Error('未提供文件数据（fileUrl 或 fileBuffer）');
      }

      switch (ext) {
        case 'gltf':
        case 'glb': {
          /* GLTF/GLB 格式加载器 */
          const { GLTFLoader } = await import(
            'three/examples/jsm/loaders/GLTFLoader.js'
          );
          const loader = new GLTFLoader();
          const gltf = await new Promise<{
            scene: unknown;
          }>((resolve, reject) => {
            loader.parse(
              arrayBuffer,
              '',
              (result) => resolve(result as { scene: unknown }),
              (err) => reject(err)
            );
          });
          model = gltf.scene;
          break;
        }

        case 'obj': {
          /* OBJ 格式加载器 */
          const { OBJLoader } = await import(
            'three/examples/jsm/loaders/OBJLoader.js'
          );
          const loader = new OBJLoader();
          /* OBJ 需要文本格式 */
          const text = new TextDecoder().decode(arrayBuffer);
          model = loader.parse(text);
          break;
        }

        case 'stl': {
          /* STL 格式加载器 */
          const { STLLoader } = await import(
            'three/examples/jsm/loaders/STLLoader.js'
          );
          const loader = new STLLoader();
          const geometry = loader.parse(arrayBuffer);
          /* STL 没有材质信息，创建默认材质 */
          const material = new THREE.MeshStandardMaterial({
            color: 0x606060,
            metalness: 0.2,
            roughness: 0.8,
          });
          model = new THREE.Mesh(geometry, material);
          break;
        }

        case 'ply': {
          /* PLY 格式加载器 */
          const { PLYLoader } = await import(
            'three/examples/jsm/loaders/PLYLoader.js'
          );
          const loader = new PLYLoader();
          const geometry = loader.parse(arrayBuffer);
          /* PLY 可能包含顶点颜色 */
          const hasVertexColors = geometry.hasAttribute('color');
          const material = new THREE.MeshStandardMaterial({
            vertexColors: hasVertexColors,
            color: hasVertexColors ? 0xffffff : 0x606060,
            metalness: 0.2,
            roughness: 0.8,
          });
          model = new THREE.Mesh(geometry, material);
          break;
        }

        default:
          throw new Error(`不支持的 3D 模型格式: .${ext}`);
      }

      /* 将模型添加到场景 */
      scene.add(model as Parameters<typeof scene.add>[0]);
      return model;
    },
    [fileName, fileUrl, fileBuffer]
  );

  /* -------------------------------------------------------------- */
  /*  初始化 Three.js 场景                                             */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    async function initScene() {
      try {
        setLoading(true);
        setError(null);

        /* 动态导入 Three.js（SSR 安全） */
        const THREE = await import('three');
        const { OrbitControls } = await import(
          'three/examples/jsm/controls/OrbitControls.js'
        );

        if (cancelled || !containerRef.current) return;

        /* 检测主题 */
        const dark = isDarkTheme();
        if (cancelled) return;
        setDarkMode(dark);

        /* 创建渲染器 */
        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
        });
        renderer.setSize(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        );
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        containerRef.current.appendChild(renderer.domElement);

        /* 创建场景 */
        const scene = new THREE.Scene();
        /* 根据主题设置背景色 */
        scene.background = new THREE.Color(dark ? 0x1a1a1a : 0xf0f0f0);

        /* 创建相机 */
        const camera = new THREE.PerspectiveCamera(
          50,
          containerRef.current.clientWidth /
            containerRef.current.clientHeight,
          0.1,
          1000
        );
        camera.position.set(5, 5, 5);
        camera.lookAt(0, 0, 0);

        /* 添加灯光 */
        /* 环境光：提供基础照明 */
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        /* 方向光：模拟太阳光，产生阴影 */
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 10);
        scene.add(directionalLight);

        /* 补光：从下方打光，减少底部过暗 */
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-10, -10, -10);
        scene.add(fillLight);

        /* 创建轨道控制器 */
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = true;
        controls.minDistance = 0.1;
        controls.maxDistance = 1000;

        /* 保存引用 */
        rendererRef.current = renderer;
        sceneRef.current = scene;
        cameraRef.current = camera;
        controlsRef.current = controls;

        /* 加载模型 */
        const model = await loadModel(scene, THREE);
        if (cancelled) return;

        modelRef.current = model;

        /* 自动居中并缩放 */
        fitCameraToModel(camera, controls, model as { traverse: (fn: (child: unknown) => void) => void });

        /* 动画循环 */
        function animate() {
          animationFrameRef.current = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        }
        animate();

        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : '加载 3D 模型失败';
        setError(msg);
        setLoading(false);
        onError?.(err instanceof Error ? err : new Error(msg));
      }
    }

    initScene();

    return () => {
      cancelled = true;
      /* 停止动画循环 */
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      /* 渲染器清理 */
      if (rendererRef.current) {
        (rendererRef.current as { dispose: () => void }).dispose();
        rendererRef.current = null;
      }
      /* 清理 DOM */
      if (containerRef.current) {
        const canvas = containerRef.current.querySelector('canvas');
        if (canvas) {
          containerRef.current.removeChild(canvas);
        }
      }
    };
  }, [loadModel, onError]);

  /* -------------------------------------------------------------- */
  /*  窗口大小变化处理                                                  */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    const handleResize = () => {
      if (
        !containerRef.current ||
        !rendererRef.current ||
        !cameraRef.current
      )
        return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      (
        rendererRef.current as {
          setSize: (w: number, h: number) => void;
        }
      ).setSize(width, height);
      (
        cameraRef.current as {
          aspect: number;
          updateProjectionMatrix: () => void;
        }
      ).aspect = width / height;
      (
        cameraRef.current as {
          updateProjectionMatrix: () => void;
        }
      ).updateProjectionMatrix();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /* -------------------------------------------------------------- */
  /*  工具栏操作                                                      */
  /* -------------------------------------------------------------- */

  /** 重置视角：将相机和控制器恢复到初始位置 */
  const handleResetView = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current || !modelRef.current) return;
    fitCameraToModel(
      cameraRef.current as {
        position: { set: (x: number, y: number, z: number) => void };
        lookAt: (x: number, y: number, z: number) => void;
      },
      controlsRef.current as {
        target: { set: (x: number, y: number, z: number) => void };
        update: () => void;
      },
      modelRef.current as { traverse: (fn: (child: unknown) => void) => void }
    );
  }, []);

  /** 切换线框模式 */
  const handleToggleWireframe = useCallback(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current as {
      traverse: (fn: (child: Record<string, unknown>) => void) => void;
    };
    const newWireframe = !wireframe;
    scene.traverse((child) => {
      const mesh = child as Record<string, unknown>;
      if (mesh.isMesh && mesh.material) {
        /* 处理单个材质或材质数组 */
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const mat of materials) {
          (mat as { wireframe: boolean }).wireframe = newWireframe;
        }
      }
    });
    setWireframe(newWireframe);
  }, [wireframe]);

  /** 全屏切换 */
  const handleToggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    /* 找到最近的带有 data-model3d-wrapper 属性的父容器 */
    const wrapper = containerRef.current.closest(
      '[data-model3d-wrapper]'
    );
    if (!wrapper) return;

    if (!document.fullscreenElement) {
      (wrapper as HTMLElement).requestFullscreen?.().then(() =>
        setIsFullscreen(true)
      );
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false));
    }
  }, []);

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
      data-model3d-wrapper
      className={`flex flex-col h-full min-h-0 ${className ?? ''}`}
    >
      {/* 工具栏 */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/30 bg-[var(--color-secondary)]">
        {/* 格式标签 */}
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-400">
          3D
        </span>

        {/* 扩展名标签 */}
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400">
          {getFileExtension(fileName).toUpperCase()}
        </span>

        <div className="flex-1" />

        {/* 文件名 */}
        <span className="text-[10px] text-muted-foreground/50 truncate max-w-[200px]">
          {fileName}
        </span>

        {/* 工具按钮 */}
        <div className="flex items-center gap-0.5 ml-2">
          {/* 重置视角 */}
          <button
            onClick={handleResetView}
            className="p-1 rounded hover:bg-muted/30 text-muted-foreground/70 hover:text-foreground transition-colors"
            title="重置视角"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* 线框模式切换 */}
          <button
            onClick={handleToggleWireframe}
            className={`p-1 rounded hover:bg-muted/30 transition-colors ${
              wireframe
                ? 'text-blue-400'
                : 'text-muted-foreground/70 hover:text-foreground'
            }`}
            title={wireframe ? '关闭线框' : '显示线框'}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>

          {/* 全屏切换 */}
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

      {/* 3D 渲染容器 */}
      <div className="flex-1 relative min-h-0">
        {/* Three.js 画布容器 */}
        <div ref={containerRef} className="w-full h-full" />

        {/* 加载中遮罩 */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-[1000]">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">
                加载 3D 模型中…
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
                  3D 模型渲染失败
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
