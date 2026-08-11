import React, { useState, useEffect } from "react"

interface PageInfo {
  title: string
  url: string
  description?: string
  keywords?: string[]
}

interface CaptureRecord {
  id: string
  title: string
  url: string
  content: string
  timestamp: number
}

export default function Sidebar() {
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null)
  const [recentCaptures, setRecentCaptures] = useState<CaptureRecord[]>([])
  const [selectedText, setSelectedText] = useState<string>("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_INFO" }, (response) => {
          if (response) {
            setPageInfo(response)
          }
        })
      }
    })

    chrome.storage.local.get(["recentCaptures"], (result) => {
      if (result.recentCaptures) {
        setRecentCaptures(result.recentCaptures)
      }
    })

    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (selection) {
        setSelectedText(selection.toString())
      }
    }

    document.addEventListener("selectionchange", handleSelectionChange)
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange)
    }
  }, [])

  const handleCapturePage = async () => {
    if (!pageInfo) return
    setLoading(true)

    try {
      const response = await chrome.runtime.sendMessage({
        type: "CAPTURE_PAGE",
        data: {
          title: pageInfo.title,
          url: pageInfo.url,
          description: pageInfo.description,
          keywords: pageInfo.keywords
        }
      })

      if (response.success) {
        const newCapture: CaptureRecord = {
          id: Date.now().toString(),
          title: pageInfo.title,
          url: pageInfo.url,
          content: pageInfo.description || "",
          timestamp: Date.now()
        }

        const updated = [newCapture, ...recentCaptures].slice(0, 20)
        setRecentCaptures(updated)
        await chrome.storage.local.set({ recentCaptures: updated })
      }
    } catch (error) {
      console.error("采集失败:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCaptureSelection = async () => {
    if (!selectedText.trim()) return
    setLoading(true)

    try {
      const response = await chrome.runtime.sendMessage({
        type: "CAPTURE_SELECTION",
        data: {
          text: selectedText,
          url: pageInfo?.url || "",
          title: pageInfo?.title || ""
        }
      })

      if (response.success) {
        const newCapture: CaptureRecord = {
          id: Date.now().toString(),
          title: pageInfo?.title || "选中内容",
          url: pageInfo?.url || "",
          content: selectedText.slice(0, 200),
          timestamp: Date.now()
        }

        const updated = [newCapture, ...recentCaptures].slice(0, 20)
        setRecentCaptures(updated)
        await chrome.storage.local.set({ recentCaptures: updated })
        setSelectedText("")
      }
    } catch (error) {
      console.error("采集失败:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  return (
    <div style={{
      padding: "16px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      maxWidth: "400px",
      minHeight: "100vh",
      backgroundColor: "#f9fafb"
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "20px",
        paddingBottom: "12px",
        borderBottom: "1px solid #e5e7eb"
      }}>
        <h1 style={{
          fontSize: "18px",
          fontWeight: "600",
          color: "#111827",
          margin: 0
        }}>
          OpenMate Collector
        </h1>
      </div>

      {pageInfo && (
        <div style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "16px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
        }}>
          <div style={{
            fontSize: "14px",
            fontWeight: "500",
            color: "#111827",
            marginBottom: "8px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}>
            {pageInfo.title}
          </div>
          <div style={{
            fontSize: "12px",
            color: "#6b7280",
            marginBottom: "12px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}>
            {pageInfo.url}
          </div>
          <button
            onClick={handleCapturePage}
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px",
              backgroundColor: loading ? "#9ca3af" : "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "500",
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            {loading ? "采集中..." : "采集到知识库"}
          </button>
        </div>
      )}

      {selectedText && (
        <div style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "16px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
        }}>
          <div style={{
            fontSize: "12px",
            color: "#6b7280",
            marginBottom: "8px"
          }}>
            选中内容
          </div>
          <div style={{
            fontSize: "13px",
            color: "#374151",
            marginBottom: "12px",
            maxHeight: "100px",
            overflow: "hidden",
            lineHeight: "1.5"
          }}>
            {selectedText.slice(0, 150)}{selectedText.length > 150 ? "..." : ""}
          </div>
          <button
            onClick={handleCaptureSelection}
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px",
              backgroundColor: loading ? "#9ca3af" : "#10b981",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "500",
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            {loading ? "采集中..." : "选中文字采集"}
          </button>
        </div>
      )}

      <div style={{
        backgroundColor: "white",
        borderRadius: "8px",
        padding: "16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
      }}>
        <h2 style={{
          fontSize: "14px",
          fontWeight: "600",
          color: "#111827",
          margin: "0 0 12px 0"
        }}>
          最近采集
        </h2>
        {recentCaptures.length === 0 ? (
          <div style={{
            fontSize: "13px",
            color: "#9ca3af",
            textAlign: "center",
            padding: "20px 0"
          }}>
            暂无采集记录
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {recentCaptures.map((capture) => (
              <div
                key={capture.id}
                style={{
                  padding: "10px",
                  backgroundColor: "#f9fafb",
                  borderRadius: "6px",
                  borderLeft: "3px solid #3b82f6"
                }}
              >
                <div style={{
                  fontSize: "13px",
                  fontWeight: "500",
                  color: "#111827",
                  marginBottom: "4px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}>
                  {capture.title}
                </div>
                <div style={{
                  fontSize: "12px",
                  color: "#6b7280"
                }}>
                  {formatTime(capture.timestamp)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
