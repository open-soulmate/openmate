import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { join, relative, extname, basename } from "path";

/**
 * GET /api/docs/list
 * 递归读取 docs/ 目录下所有 .md 文件，按分组规则返回结构化列表
 * 
 * 返回格式：{ groups: [{ name, icon, files: [{path, name, group, date}] }] }
 */

/* ── 分组定义 ────────────────────────────────────────── */

/** 分组配置：名称、图标、匹配的目录前缀 */
interface GroupConfig {
  name: string;       // 分组中文名
  icon: string;       // 图标名称（lucide-react 图标名）
  prefixes: string[]; // 匹配的目录前缀（相对于 docs/）
}

/** 分组规则定义 */
const GROUPS: GroupConfig[] = [
  { name: "架构决策", icon: "layers",    prefixes: ["ADR/"] },
  { name: "架构设计", icon: "layout",    prefixes: ["design/", "features/"] },
  { name: "协议规范", icon: "file-text", prefixes: ["protocols/"] },
  { name: "开发规范", icon: "book-open", prefixes: ["specs/", "guidelines/"] },
  { name: "使用运维", icon: "settings",  prefixes: ["usage/"] },
  { name: "其他",     icon: "folder",    prefixes: [] }, // 特殊处理：FAQ.md, README.md, devlog/ 等
];

/* ── 文件信息接口 ────────────────────────────────────── */

interface DocFile {
  path: string;   // 相对于 docs/ 的路径，如 "ADR/001-选择ACP协议.md"
  name: string;   // 文件显示名（去掉扩展名）
  group: string;  // 所属分组名
  date: string;   // 修改日期 YYYY-MM-DD
}

interface DocGroup {
  name: string;       // 分组名
  icon: string;       // 图标名
  files: DocFile[];   // 该分组下的文件列表
}

/* ── 递归读取目录 ────────────────────────────────────── */

/**
 * 递归读取目录下所有 .md 文件
 * @param dir 要读取的目录绝对路径
 * @param baseDir 根目录（用于计算相对路径）
 * @returns 文件路径列表（相对于 baseDir）
 */
async function readAllMdFiles(dir: string, baseDir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // 递归进入子目录
        const subFiles = await readAllMdFiles(fullPath, baseDir);
        results.push(...subFiles);
      } else if (entry.isFile() && extname(entry.name) === ".md") {
        // 计算相对于 docs/ 的路径
        const relPath = relative(baseDir, fullPath);
        results.push(relPath);
      }
    }
  } catch {
    // 目录不存在时静默处理
  }
  return results;
}

/* ── 分组判断 ────────────────────────────────────────── */

/**
 * 根据文件相对路径判断所属分组
 * @param relPath 相对于 docs/ 的路径
 * @returns 分组名称
 */
function getGroupForFile(relPath: string): string {
  // 先检查特殊文件（根目录下的独立文件）
  const rootFiles = ["FAQ.md", "README.md", "BIDDING-MODULE-PLAN.md", "IMPLEMENTATION-TRACKER.md", "page-layout-plan.md"];
  const fileName = basename(relPath);
  const dirPart = relPath.includes("/") ? relPath.split("/")[0] + "/" : "";
  
  // devlog/ 目录归入"其他"
  if (dirPart === "devlog/" || rootFiles.includes(fileName)) {
    return "其他";
  }

  // 按目录前缀匹配分组
  for (const group of GROUPS) {
    // 跳过"其他"分组（已特殊处理）
    if (group.name === "其他") continue;
    for (const prefix of group.prefixes) {
      if (relPath.startsWith(prefix)) {
        return group.name;
      }
    }
  }

  // 未匹配到任何分组的文件归入"其他"
  return "其他";
}

/* ── 图标映射 ────────────────────────────────────────── */

/** 根据分组名返回图标名 */
function getIconForGroup(groupName: string): string {
  const found = GROUPS.find(g => g.name === groupName);
  return found?.icon || "folder";
}

/* ── 文件名解析 ──────────────────────────────────────── */

/**
 * 从文件路径提取显示名称
 * 去掉 .md 扩展名，去掉前导编号（如 "001-"）
 */
function getDisplayName(relPath: string): string {
  const fileName = basename(relPath, ".md");
  // 去掉类似 "001-" 的前导编号前缀
  return fileName.replace(/^\d+-/, "");
}

/* ── API 路由处理 ────────────────────────────────────── */

export async function GET() {
  const docsDir = join(process.cwd(), "docs");
  
  try {
    // 递归读取所有 .md 文件
    const allFiles = await readAllMdFiles(docsDir, docsDir);
    
    // 排除 specs/00-INDEX.md（索引文件，不需要展示）
    const filteredFiles = allFiles.filter(f => f !== "specs/00-INDEX.md");

    // 构建文件信息列表
    const docFiles: DocFile[] = await Promise.all(
      filteredFiles.map(async (relPath) => {
        const fullPath = join(docsDir, relPath);
        const fileStat = await stat(fullPath);
        return {
          path: relPath,
          name: getDisplayName(relPath),
          group: getGroupForFile(relPath),
          date: fileStat.mtime.toISOString().split("T")[0],
        };
      })
    );

    // 按分组归类
    const groupMap = new Map<string, DocFile[]>();
    for (const file of docFiles) {
      const existing = groupMap.get(file.group) || [];
      existing.push(file);
      groupMap.set(file.group, existing);
    }

    // 按分组定义顺序输出，每组内按文件名排序
    const groups: DocGroup[] = GROUPS
      .filter(g => groupMap.has(g.name)) // 只返回有文件的分组
      .map(g => ({
        name: g.name,
        icon: g.icon,
        files: (groupMap.get(g.name) || []).sort((a, b) => a.name.localeCompare(b.name)),
      }));

    return NextResponse.json({ groups });
  } catch (err) {
    console.error("[/api/docs/list] 读取 docs 目录失败:", err);
    return NextResponse.json({ groups: [] }, { status: 500 });
  }
}
