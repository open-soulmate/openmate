/**
 * 插件导航管理器 — 自动从plugin.json读取导航配置
 * 
 * 插件在plugin.json中声明nav，系统自动注册到底部导航栏
 * 插件卸载时自动移除导航项
 */

export interface PluginNavConfig {
  label: string;
  icon: string;
  position?: string; // "after:dev-specs" | "before:chat" | "end"
}

export interface PluginNavItem {
  href: string;
  label: string;
  icon: string;
  pluginId: string;
  position: string;
}

// 缓存已加载的插件导航项
let cachedNavItems: PluginNavItem[] = [];

/**
 * 获取API基地址
 */
function getApiBase(): string {
  if (typeof window === 'undefined') return '';
  const hostname = window.location.hostname;
  return `http://${hostname}:8092`;
}

/**
 * 从后端获取所有已加载插件的导航配置
 */
export async function fetchPluginNavItems(): Promise<PluginNavItem[]> {
  try {
    const res = await fetch(`${getApiBase()}/plugins`);
    if (!res.ok) return [];
    
    const data = await res.json();
    const plugins = data.plugins || [];
    
    const navItems: PluginNavItem[] = [];
    
    for (const plugin of plugins) {
      if (plugin.status !== 'loaded' || !plugin.manifest?.frontend?.nav) {
        continue;
      }
      
      const nav = plugin.manifest.frontend.nav;
      navItems.push({
        href: `/plugins/${plugin.manifest.id}`,
        label: nav.label,
        icon: nav.icon,
        pluginId: plugin.manifest.id,
        position: nav.position || 'end',
      });
    }
    
    cachedNavItems = navItems;
    return navItems;
  } catch {
    return cachedNavItems;
  }
}

/**
 * 获取缓存的插件导航项（同步）
 */
export function getCachedPluginNavItems(): PluginNavItem[] {
  return cachedNavItems;
}

/**
 * 将插件导航项插入到导航列表的正确位置
 * 
 * @param baseItems 基础导航项列表
 * @param pluginItems 插件导航项列表
 * @returns 合并后的导航项列表
 */
export function mergePluginNavItems(
  baseItems: Array<{ href: string; label: string; icon: any }>,
  pluginItems: PluginNavItem[]
): Array<{ href: string; label: string; icon: any }> {
  if (pluginItems.length === 0) {
    return baseItems;
  }
  
  const result = [...baseItems];
  
  // 按position分组
  const beforeItems = pluginItems.filter(p => p.position === 'start');
  const afterItems = pluginItems.filter(p => p.position.startsWith('after:'));
  const endItems = pluginItems.filter(p => p.position === 'end' || !p.position);
  
  // 插入到开头
  for (const item of beforeItems.reverse()) {
    result.unshift({
      href: item.href,
      label: item.label,
      icon: item.icon, // 返回图标名称，由bottom-nav.tsx处理映射
    });
  }
  
  // 插入到指定位置之后
  for (const item of afterItems) {
    const targetHref = item.position.replace('after:', '');
    const targetIndex = result.findIndex(r => r.href === `/${targetHref}`);
    if (targetIndex >= 0) {
      result.splice(targetIndex + 1, 0, {
        href: item.href,
        label: item.label,
        icon: item.icon,
      });
    } else {
      // 找不到目标位置，添加到末尾
      result.push({
        href: item.href,
        label: item.label,
        icon: item.icon,
      });
    }
  }
  
  // 插入到末尾
  for (const item of endItems) {
    result.push({
      href: item.href,
      label: item.label,
      icon: item.icon,
    });
  }
  
  return result;
}
