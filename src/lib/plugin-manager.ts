/**
 * 插件管理器 — 动态加载OpenMate插件
 * 
 * 插件架构：
 * 1. 插件声明在plugins/<name>/plugin.json
 * 2. 前端通过API获取插件列表
 * 3. 动态导入插件页面组件
 * 4. 导航栏自动添加插件入口
 */

export interface PluginManifest {
  name: string;
  version: string;
  author: string;
  description: string;
  icon: string;
  category: string;
  permissions: string[];
  hooks: string[];
  routes: string[];
  frontend: {
    pages: string[];
    nav?: {
      label: string;
      icon: string;
      href: string;
      position?: string;
    };
  };
  config?: Record<string, any>;
}

export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  status: 'loaded' | 'error' | 'disabled';
  manifest?: PluginManifest;
}

/**
 * 获取API基地址
 */
function getApiBase(): string {
  if (typeof window === 'undefined') return '';
  const hostname = window.location.hostname;
  return `http://${hostname}:8092`;
}

/**
 * 获取所有已加载的插件列表
 */
export async function fetchPlugins(): Promise<PluginInfo[]> {
  try {
    const res = await fetch(`${getApiBase()}/plugins`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.plugins || [];
  } catch {
    return [];
  }
}

/**
 * 获取插件清单详情
 */
export async function getPluginManifest(pluginName: string): Promise<PluginManifest | null> {
  try {
    const res = await fetch(`${getApiBase()}/plugins/${pluginName}/manifest`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 动态导入插件页面组件
 * 
 * 插件页面位于: plugins/<name>/<page>.tsx
 * 通过Next.js的dynamic import实现懒加载
 */
export async function loadPluginPage(pluginName: string, page: string): Promise<any> {
  try {
    // 插件页面通过特殊路径加载
    // 实际实现需要Next.js配置支持
    const module = await import(`@/plugins/${pluginName}/${page}`);
    return module.default || module;
  } catch {
    console.error(`Failed to load plugin page: ${pluginName}/${page}`);
    return null;
  }
}

/**
 * 获取插件的导航配置
 */
export function getPluginNavItems(plugins: PluginInfo[]): Array<{
  href: string;
  label: string;
  icon: string;
  plugin: string;
}> {
  const navItems: Array<{
    href: string;
    label: string;
    icon: string;
    plugin: string;
  }> = [];

  for (const plugin of plugins) {
    if (plugin.status !== 'loaded' || !plugin.manifest?.frontend?.nav) {
      continue;
    }

    const nav = plugin.manifest.frontend.nav;
    navItems.push({
      href: nav.href,
      label: nav.label,
      icon: nav.icon,
      plugin: plugin.name,
    });
  }

  return navItems;
}

/**
 * 检查插件是否已启用
 */
export function isPluginEnabled(pluginName: string, plugins: PluginInfo[]): boolean {
  return plugins.some(p => p.name === pluginName && p.status === 'loaded');
}

/**
 * 插件配置管理
 */
export class PluginConfig {
  private pluginName: string;
  private config: Record<string, any>;

  constructor(pluginName: string, config: Record<string, any> = {}) {
    this.pluginName = pluginName;
    this.config = config;
  }

  get<T>(key: string, defaultValue?: T): T {
    return (this.config[key] ?? defaultValue) as T;
  }

  set(key: string, value: any): void {
    this.config[key] = value;
  }

  getAll(): Record<string, any> {
    return { ...this.config };
  }
}
