chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "openmate-capture-page",
    title: "采集页面到 OpenMate",
    contexts: ["page"]
  })

  chrome.contextMenus.create({
    id: "openmate-capture-selection",
    title: "采集选中内容到 OpenMate",
    contexts: ["selection"]
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return

  const SOUL_API_BASE = "http://localhost:8090/api/capture"

  if (info.menuItemId === "openmate-capture-page") {
    chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_INFO" }, async (response) => {
      if (response) {
        await sendToSoulAPI("/page", {
          title: response.title,
          url: response.url,
          description: response.description,
          keywords: response.keywords
        })
      }
    })
  }

  if (info.menuItemId === "openmate-capture-selection" && info.selectionText) {
    await sendToSoulAPI("/selection", {
      text: info.selectionText,
      url: tab.url || "",
      title: tab.title || ""
    })
  }
})

async function sendToSoulAPI(endpoint: string, data: Record<string, unknown>) {
  const SOUL_API_BASE = "http://localhost:8090/api/capture"

  try {
    const response = await fetch(`${SOUL_API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error("发送到 Soul API 失败:", error)
    throw error
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CAPTURE_PAGE") {
    sendToSoulAPI("/page", message.data)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }))
    return true
  }

  if (message.type === "CAPTURE_SELECTION") {
    sendToSoulAPI("/selection", message.data)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: error.message }))
    return true
  }
})
