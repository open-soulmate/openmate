"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const file = fileList[0];
    setUploadProgress(`上传中: ${file.name} (${formatBytes(file.size)})`);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${apiBase}/api/vein/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data = await res.json();
      setUploadProgress(`✅ 上传成功: ${data.name} (${formatBytes(data.size)})`);
      fetchFiles();
      fetchStats();
    } catch (e: any) {
      setUploadProgress(`❌ 上传失败: ${e.message}`);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(""), 3000);
    }
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const res = await fetch(`${apiBase}/api/vein/files/${fileId}/download`);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("Download failed", e);
    }
  };

  const handleDelete = async (fileId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/vein/files/${fileId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setSelectedFile(null);
      fetchFiles();
      fetchStats();
    } catch (e: any) {
      console.error("Delete failed", e);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) handleUpload(e.dataTransfer.files);
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
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              borderRadius: "8px",
              border: "none",
              padding: "6px 14px",
              fontSize: "14px",
              cursor: uploading ? "not-allowed" : "pointer",
              background: "var(--primary, #3b82f6)",
              color: "#fff",
              opacity: uploading ? 0.6 : 1,
            }}
          >
            ⬆️ {uploading ? "上传中..." : "上传文件"}
          </button>
          <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={e => handleUpload(e.target.files)} />
          <button
            onClick={() => { fetchFiles(); fetchStats(); }}
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
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Upload progress */}
        {uploadProgress && (
          <div style={{
            padding: "10px 16px",
            borderRadius: "8px",
            background: uploadProgress.startsWith("✅") ? "rgba(16,185,129,0.1)" : uploadProgress.startsWith("❌") ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.1)",
            fontSize: "13px",
            color: uploadProgress.startsWith("✅") ? "#10b981" : uploadProgress.startsWith("❌") ? "#ef4444" : "#3b82f6",
          }}>
            {uploadProgress}
          </div>
        )}

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
                <span style={{ borderRadius: "8px", background: "rgba(59,130,246,0.1)", padding: "6px", fontSize: "14px" }}>📁</span>
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
                <span style={{ borderRadius: "8px", background: "rgba(16,185,129,0.1)", padding: "6px", fontSize: "14px" }}>💾</span>
              </div>
              <p style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>{formatBytes(stats.store.total_size_bytes)}</p>
              <p style={{ fontSize: "12px", color: "var(--muted-foreground, #6b7280)", marginTop: "2px" }}>
                {stats.store.total_files} 个文件
              </p>
            </div>
          </div>
        )}

        {/* Drag & drop zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            borderRadius: "12px",
            border: `2px dashed ${dragActive ? "var(--primary, #3b82f6)" : "var(--border, #e5e7eb)"}`,
            padding: "32px",
            textAlign: "center",
            cursor: "pointer",
            background: dragActive ? "rgba(59,130,246,0.05)" : "transparent",
            transition: "all 0.2s",
          }}
        >
          <span style={{ fontSize: "32px", opacity: 0.5 }}>📤</span>
          <p style={{ margin: "8px 0 4px", fontSize: "14px", fontWeight: 500 }}>
            {dragActive ? "释放文件以上传" : "拖拽文件到此处，或点击选择文件"}
          </p>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--muted-foreground, #6b7280)" }}>
            支持任意文件类型，自动去重存储
          </p>
        </div>

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
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "var(--muted-foreground, #6b7280)", width: "100px" }}>
                      大小
                    </th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "var(--muted-foreground, #6b7280)", width: "100px" }}>
                      类型
                    </th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 500, color: "var(--muted-foreground, #6b7280)", width: "160px" }}>
                      上传时间
                    </th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "var(--muted-foreground, #6b7280)", width: "120px" }}>
                      操作
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
                        background: selectedFile?.file_id === f.file_id ? "var(--muted, #f9fafb)" : "transparent",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--muted, #f9fafb)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = selectedFile?.file_id === f.file_id ? "var(--muted, #f9fafb)" : "transparent")}
                      onClick={() => setSelectedFile(selectedFile?.file_id === f.file_id ? null : f)}
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
                      <td style={{ padding: "10px 16px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(f.file_id, f.name); }}
                            title="下载"
                            style={{
                              borderRadius: "6px",
                              border: "1px solid var(--border, #e5e7eb)",
                              padding: "4px 8px",
                              fontSize: "12px",
                              cursor: "pointer",
                              background: "transparent",
                            }}
                          >
                            ⬇️
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(f.file_id); }}
                            title="删除"
                            style={{
                              borderRadius: "6px",
                              border: "1px solid rgba(239,68,68,0.3)",
                              padding: "4px 8px",
                              fontSize: "12px",
                              cursor: "pointer",
                              background: "transparent",
                              color: "#ef4444",
                            }}
                          >
                            🗑️
                          </button>
                        </div>
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
