import { NextResponse } from "next/server";
import { readdir, stat, readFile } from "fs/promises";
import { join } from "path";

/* GET /api/devlog/list
   动态读取 docs/devlog/ 目录下的所有 .md 文件，返回文件列表+元信息
   文件命名规范：{YYYY-MM-DD}-{feature-name}.md */
export async function GET() {
  const devlogDir = join(process.cwd(), "docs", "devlog");
  try {
    const files = await readdir(devlogDir);
    /* 只保留 .md 文件 */
    const mdFiles = files.filter(f => f.endsWith(".md")).sort().reverse(); // 按日期倒序

    /* 读取每个文件的元信息 */
    const logs = await Promise.all(
      mdFiles.map(async (fileName) => {
        const filePath = join(devlogDir, fileName);
        const fileStat = await stat(filePath);
        
        /* 从文件名解析日期和功能名称，如 2026-09-05-ai-groups-feature.md */
        const match = fileName.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
        const date = match?.[1] || fileStat.mtime.toISOString().split("T")[0];
        const featureName = match?.[2] || fileName.replace(".md", "");
        
        /* 尝试从文件内容提取版本号和状态 */
        let version = "1.0";
        let desc = featureName;
        let name = featureName;
        try {
          const content = await readFile(filePath, "utf-8");
          /* 提取标题（第一个 # 开头的行） */
          const titleMatch = content.match(/^#\s+(.+)$/m);
          if (titleMatch) name = titleMatch[1];
          /* 提取版本号 */
          const versionMatch = content.match(/>\s*版本：\s*v?([\d.]+)/);
          if (versionMatch) version = versionMatch[1];
          /* 提取概述作为描述 */
          const overviewMatch = content.match(/##\s*概述\s*\n([\s\S]+?)(?:\n\n|\n##)/);
          if (overviewMatch) desc = overviewMatch[1].trim().substring(0, 100);
        } catch {
          /* 读取失败时使用默认值 */
        }
        
        return {
          id: fileName.replace(".md", ""),
          name,
          desc,
          version,
          fileName,
          date,
        };
      })
    );

    return NextResponse.json({ logs });
  } catch (err) {
    return NextResponse.json({ error: "failed to read devlog directory", logs: [] }, { status: 500 });
  }
}
