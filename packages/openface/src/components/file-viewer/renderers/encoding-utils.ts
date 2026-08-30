/**
 * Detect encoding from HTML meta charset and decode ArrayBuffer accordingly.
 * Falls back to UTF-8 if no charset detected.
 */
export function decodeWithEncoding(buffer: ArrayBuffer, fallbackEncoding = 'utf-8'): string {
  // First pass: try UTF-8 to look for charset declaration
  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  
  // Check for <meta charset="xxx"> or <meta http-equiv="Content-Type" content="...charset=xxx">
  const charsetMatch = utf8Text.match(/<meta[^>]+charset=["']?([^"'\s;>]+)/i)
    || utf8Text.match(/<meta[^>]+content=["'][^"']*charset=([^"'\s;]+)/i);
  
  if (charsetMatch) {
    const charset = charsetMatch[1].toLowerCase().trim();
    // Common non-UTF-8 encodings
    if (charset !== 'utf-8' && charset !== 'utf8') {
      try {
        return new TextDecoder(charset).decode(buffer);
      } catch {
        // Unsupported encoding, fall through to UTF-8
      }
    }
  }
  
  // Check for BOM (Byte Order Mark)
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(buffer);
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(buffer);
  if (bytes[0] === 0xEF && bytes.length > 2 && bytes[1] === 0xBB && bytes[2] === 0xBF) return new TextDecoder('utf-8').decode(buffer);
  
  // If UTF-8 decode has replacement characters, try common Chinese encodings
  if (utf8Text.includes('\uFFFD')) {
    for (const enc of ['gbk', 'gb2312', 'gb18030', 'big5']) {
      try {
        const decoded = new TextDecoder(enc).decode(buffer);
        if (!decoded.includes('\uFFFD')) return decoded;
      } catch {}
    }
  }
  
  return new TextDecoder(fallbackEncoding).decode(buffer);
}

/**
 * Decode a data URL's content with encoding detection.
 */
export function decodeDataUrl(dataUrl: string): string {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) return '';
    const base64 = dataUrl.slice(commaIdx + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return decodeWithEncoding(bytes.buffer);
  } catch { return ''; }
}
