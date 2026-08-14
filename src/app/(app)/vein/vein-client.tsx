"use client";

import { useState, useEffect, useCallback } from "react";
import { getApiBaseUrl } from "@/lib/api-client";

interface FileItem {
  file_id: string;
  name: string;
  size: number;
  mime_type: string;
  tags: string[];
  created_at: number;
  content_hash: string;
}

interface VeinStats {
  store: {
    total_files: number;
    total_size_bytes: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("pdf") ||
    mimeType.includes("document") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation") ||
    mimeType.includes("msword") ||
    mimeType.includes("excel") ||
    mimeType.includes("powerpoint")
  )
    return "📄";
  if (
    mimeType.includes("javascript") ||
    mimeType.includes("json") ||
    mimeType.includes("xml") ||
    mimeType.includes("html") ||
    mimeType.includes("css") ||
    mimeType.includes("typescript") ||
    mimeType.includes("python") ||
    mimeType.includes("java") ||
    mimeType.includes("zip") ||
    mimeType.includes("tar") ||
    mimeType.includes("gzip")
  )
    return "💻";
  return "📎";
}

function getFileTypeLabel(mimeType: string): string {
  const ext = mimeType.split("/")[1] || mimeType;
  const map: Record<string, string> = {
    pdf: "PDF",
    "msword": "Word",
    "vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "vnd.ms-excel": "Excel",
    "vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
    "vnd.ms-powerpoint": "PPT",
    "vnd.openxmlformats-officedocument.presentationml.presentation": "PPT",
    jpeg: "JPEG",
    png: "PNG",
    gif: "GIF",
    svg: "SVG",
    webp: "WebP",
    mp4: "MP4",
    "x-matroska": "MKV",
    quicktime: "MOV",
    plain: "Text",
    html: "HTML",
    css: "CSS",
    javascript: "JS",
    json: "JSON",
    xml: "XML",
    zip: "ZIP",
    "x-tar": "TAR",
    "x-gzip": "GZ",
  };
  return map[ext] || ext.toUpperCase();
}

export function VeinClient() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [stats, setStats] = useState<VeinStats | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const apiBase = getApiBaseUrl();

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("name", search);
      const res = await fetch(`${apiBase}/api/vein/files?${params}`);
      const data = await res.json();
      setFiles(data.files || []);
    } catch (e) {
      console.error("Failed to fetch files", e);
    } finally {
      setLoading(false);
    }
  }, [apiBase, search]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/vein/stats`);
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Failed to fetch stats", e);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchFiles();
    fetchStats();
  }, [fetchFiles, fetchStats]);

  const handleSearch = () => {
    fetchFiles();
  };

  const filteredFiles = files;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border, #e5e7eb)",
          padding: "16px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "20px" }}>🩸</span>
          <h1 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>文件管理</h1>
          <span
            style={{
              borderRadius: "9999px",
              background: "rgba(239,68,68,0.1)",
              padding: "2px 8px",
              fontSize: "12px",
              fontWeight: 500,
              color: "#ef4444",
            }}
          >
            Vein
          </span>
        </div>
        <button
          onClick={() => {
            fetchFiles();
            fetchStats();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            borderRadius: "8px",
            border: "1px solid var(--border, #e5e7eb)",
            padding: "6px 12px",
            fontSize: "14px",
            cursor: "pointer",
            background: "transparent",
          }}
        >
          🔄 刷新
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Stats */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
            <div
              style={{
                borderRadius: "12px",
                border: "1px solid var(--border, #e5e7eb)",
                padding: "16px",
                background: "var(--card, #fff)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--muted-foreground, #6b7280)" }}>文件总数</span>
                <span
                  style={{
                    borderRadius: "8px",
                    background: "rgba(59,130,246,0.1)",
                    padding: "6px",
                    fontSize: "14px",
                  }}
                >
                  📁
                </span>
              </div>
              <p style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>{stats.store.total_files}</p>
              <p style={{ fontSize: "12px", color: "var(--muted-foreground, #6b7280)", marginTop: "2px" }}>
                {formatBytes(stats.store.total_size_bytes)}
              </p>
            </div>
            <div
              style={{
                borderRadius: "12px",
                border: "1px solid var(--border, #e5e7eb)",
                padding: "16px",
                background: "var(--card, #fff)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--muted-foreground, #6b7280)" }}>总存储大小</span>
                <span
                  style={{
                    borderRadius: "8px",
                    background: "rgba(16,185,129,0.1)",
                    padding: "6px",
                    fontSize: "14px",
                  }}
                >
                  💾
                </span>
              </div>
              <p style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>{formatBytes(stats.store.total_size_bytes)}</p>
              <p style={{ fontSize: "12px", color: "var(--muted-foreground, #6b7280)", marginTop: "2px" }}>
                {stats.store.total_files} 个文件
              </p>
            </div>
          </div>
        )}

        {/* Search + File List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ position: "relative", flex: 1, maxWidth: "384px" }}>
              <span
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--muted-foreground, #6b7280)",
                  fontSize: "14px",
                }}
              >
                🔍
              </span>
              <input
                type="text"
                placeholder="搜索文件名..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                style={{
                  width: "100%",
                  borderRadius: "8px",
                  border: "1px solid var(--border, #e5e7eb)",
                  background: "var(--background, #fff)",
                  padding: "8px 12px 8px 36px",
                  fontSize: "14px",
                  outline: "none",
                }}
              />
            </div>
            <button
              onClick={handleSearch}
              style={{
                borderRadius: "8px",
                border: "1px solid var(--border, #e5e7eb)",
                padding: "8px 16px",
                fontSize: "14px",
                cursor: "pointer",
                background: "var(--primary, #3b82f6)",
                color: "#fff",
              }}
            >
              搜索
            </button>
            <span style={{ fontSize: "12px", color: "var(--muted-foreground, #6b7280)" }}>
              {loading ? "加载中..." : `${filteredFiles.length} 个文件`}
            </span>
          </div>

          {filteredFiles.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "64px 0",
                color: "var(--muted-foreground, #6b7280)",
              }}
            >
              <span style={{ fontSize: "40px", opacity: 0.3, marginBottom: "12px" }}>📂</span>
              <p style={{ fontSize: "14px", margin: 0 }}>暂无文件</p>
              <p style={{ fontSize: "12px", marginTop: "4px" }}>
                {search ? "未找到匹配的文件" : "上传文件开始使用"}
              </p>
            </div>
          ) : (
            <div
              style={{
                borderRadius: "12px",
                border: "1px solid var(--border, #e5e7eb)",
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border, #e5e7eb)", background: "var(--muted, #f9fafb)" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "var(--muted-foreground, #6b7280)" }}>
                      文件名
                    </th>
                    <th
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        fontWeight: 500,
                        color: "var(--muted-foreground, #6b7280)",
                        width: "100px",
                      }}
                    >
                      大小
                    </th>
                    <th
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        fontWeight: 500,
                        color: "var(--muted-foreground, #6b7280)",
                        width: "100px",
                      }}
                    >
                      类型
                    </th>
                    <th
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        fontWeight: 500,
                        color: "var(--muted-foreground, #6b7280)",
                        width: "160px",
                      }}
                    >
                      上传时间
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((f) => (
                    <tr
                      key={f.file_id}
                      style={{
                        borderBottom: "1px solid var(--border, #e5e7eb)",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--muted, #f9fafb)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ flexShrink: 0 }}>{getFileIcon(f.mime_type)}</span>
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "280px",
                            }}
                            title={f.name}
                          >
                            {f.name}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 16px", color: "var(--muted-foreground, #6b7280)" }}>
                        {formatBytes(f.size)}
                      </td>
                      <td style={{ padding: "10px 16px", color: "var(--muted-foreground, #6b7280)", fontSize: "12px" }}>
                        {getFileTypeLabel(f.mime_type)}
                      </td>
                      <td style={{ padding: "10px 16px", color: "var(--muted-foreground, #6b7280)", fontSize: "12px" }}>
                        {formatTime(f.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
