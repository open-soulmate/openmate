"use client";
/**
 * 插件页面加载器 — 动态加载插件前端页面
 * 
 * 遵循 Plugin v1.0 前端嵌入规范：
 * - 基于 OpenFace Next/Tauri 组件体系
 * - 独立路由、独立面板展示
 * - 复用全局权限体系
 * - 前端可直接调用本插件后端路由接口
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

// 插件页面组件缓存
const pluginPageCache: Record<string, React.ComponentType> = {};

export default function PluginPage() {
  const params = useParams();
  const pluginName = params.plugin as string;
  const [PluginComponent, setPluginComponent] = useState<React.ComponentType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPluginPage() {
      // 检查缓存
      if (pluginPageCache[pluginName]) {
        setPluginComponent(() => pluginPageCache[pluginName]);
        setLoading(false);
        return;
      }

      try {
        // 动态导入插件页面
        // 插件页面位于 plugins/{name}/frontend/page.tsx
        const module = await import(`@/plugins/${pluginName}/frontend/page`);
        const Component = module.default || module;
        pluginPageCache[pluginName] = Component;
        setPluginComponent(() => Component);
      } catch (err) {
        console.error(`Failed to load plugin page: ${pluginName}`, err);
        setError(`插件 "${pluginName}" 的前端页面加载失败`);
      } finally {
        setLoading(false);
      }
    }

    if (pluginName) {
      loadPluginPage();
    }
  }, [pluginName]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">加载插件中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="text-6xl mb-4">🔌</div>
        <h2 className="text-lg font-semibold mb-2">插件加载失败</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <p className="text-sm text-muted-foreground">
          请检查插件是否已安装，或联系管理员
        </p>
      </div>
    );
  }

  if (!PluginComponent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-lg font-semibold mb-2">插件未找到</h2>
        <p className="text-muted-foreground">
          插件 "{pluginName}" 不存在或未启用
        </p>
      </div>
    );
  }

  return <PluginComponent />;
}
