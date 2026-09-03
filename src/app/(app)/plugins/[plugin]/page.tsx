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

// 直接导入插件页面组件（避免动态导入问题）
import BiddingPage from "@/plugins/bidding/frontend/page";

// 插件页面映射表
const PLUGIN_PAGES: Record<string, React.ComponentType> = {
  "bidding": BiddingPage,
};

export default function PluginPage() {
  const params = useParams();
  const pluginName = params.plugin as string;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 模拟加载延迟
    const timer = setTimeout(() => setLoading(false), 100);
    return () => clearTimeout(timer);
  }, []);

  const PluginComponent = PLUGIN_PAGES[pluginName];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">加载插件中...</span>
      </div>
    );
  }

  if (!PluginComponent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="text-6xl mb-4">🔌</div>
        <h2 className="text-lg font-semibold mb-2">插件未找到</h2>
        <p className="text-muted-foreground">
          插件 "{pluginName}" 不存在或未启用
        </p>
      </div>
    );
  }

  return <PluginComponent />;
}
