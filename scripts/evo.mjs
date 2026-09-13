#!/usr/bin/env node
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";

// 解析命令行参数
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const filePath = args.find((arg) => arg.endsWith(".tsx") || arg.endsWith(".ts")) || "";
const backupDir = ".evo-backup";
const changeSignature = args.find((arg) => arg.startsWith("--signature="))?.split("=")[1];

// 确保备份目录存在
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// 计算文件哈希
function calculateFileHash(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return crypto.createHash("sha256").update(content).digest("hex");
}

// 获取文件统计信息（行数、函数数量）
function getFileStats(filePath) {
  if (!fs.existsSync(filePath)) {
    return { lines: 0, functions: 0 };
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").length;
  const functionMatches = content.match(
    /function\s+\w+|const\s+\w+\s*=\s*(?:\([^)]*\)|[^=]*)\s*=>|export\s+(?:default\s+)?function\s+\w+|async\s+function\s+\w+|class\s+\w+/g
  );
  return {
    lines,
    functions: functionMatches ? functionMatches.length : 0,
  };
}
