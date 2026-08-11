function getPageMetadata() {
  const title = document.title || ""
  const url = window.location.href

  const metaDescription = document.querySelector('meta[name="description"]')
  const description = metaDescription?.getAttribute("content") || ""

  const metaKeywords = document.querySelector('meta[name="keywords"]')
  const keywords = metaKeywords?.getAttribute("content")?.split(",").map(k => k.trim()).filter(Boolean) || []

  const ogTitle = document.querySelector('meta[property="og:title"]')
  const ogDescription = document.querySelector('meta[property="og:description"]')

  return {
    title: ogTitle?.getAttribute("content") || title,
    url,
    description: ogDescription?.getAttribute("content") || description,
    keywords
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PAGE_INFO") {
    const pageInfo = getPageMetadata()
    sendResponse(pageInfo)
  }

  if (message.type === "GET_SELECTED_TEXT") {
    const selection = window.getSelection()
    const selectedText = selection?.toString() || ""
    sendResponse({ selectedText })
  }

  return true
})
