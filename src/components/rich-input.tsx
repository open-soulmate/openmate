'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface RichInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minRows?: number;
  maxRows?: number;
}

/**
 * RichInput — contenteditable富文本输入框
 * 
 * 特性：
 * - 支持富文本粘贴（保留格式、图片、表格）
 * - 自适应高度（minRows → maxRows）
 * - 可编辑粘贴内容
 * - 粘贴时自动清理多余样式
 * - 支持Enter/Shift+Enter
 */
export function RichInput({
  value,
  onChange,
  onKeyDown,
  placeholder = '',
  disabled = false,
  className,
  minRows = 1,
  maxRows = 15,
}: RichInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const isComposing = useRef(false);

  // Sync value → DOM (only when value changes externally)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // Only update if not focused (avoid cursor jump)
    if (document.activeElement !== el) {
      el.innerHTML = value || '';
      setIsEmpty(!value);
    }
  }, [value]);

  // Auto-resize
  const autoResize = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    
    // Reset height to measure
    el.style.height = 'auto';
    
    // Calculate line height (approximate)
    const lineHeight = 24;
    const minHeight = minRows * lineHeight + 16; // +padding
    const maxHeight = maxRows * lineHeight + 16;
    
    const scrollHeight = el.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    el.style.height = newHeight + 'px';
    
    // Enable scroll if content exceeds max height
    el.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [minRows, maxRows]);

  // Handle input
  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    
    const text = el.innerText;
    const html = el.innerHTML;
    
    // Check if empty
    const empty = !text.trim();
    setIsEmpty(empty);
    
    // Emit plain text for the value prop
    // But keep rich HTML in the editor
    onChange(text);
    autoResize();
  }, [onChange, autoResize]);

  // Handle paste — clean up but preserve basic formatting
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    
    if (html) {
      const cleaned = cleanPastedHtml(html);
      document.execCommand('insertHTML', false, cleaned);
    } else {
      // Detect code blocks in plain text and highlight them
      const formatted = formatPlainTextWithCode(text);
      document.execCommand('insertHTML', false, formatted);
    }
    
    handleInput();
  }, [handleInput]);

  // Handle key down
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // IME composition tracking
    if (e.nativeEvent.isComposing) return;
    
    onKeyDown?.(e);
  }, [onKeyDown]);

  // Handle focus — place cursor at end
  const handleFocus = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    
    // Place cursor at end
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  return (
    <div className={cn('relative', className)}>
      {/* Placeholder */}
      {isEmpty && (
        <div className="absolute top-0 left-0 pointer-events-none text-muted-foreground/50 text-sm px-1 py-0.5">
          {placeholder}
        </div>
      )}
      
      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        className={cn(
          'w-full text-sm outline-none min-h-[24px] px-1 py-0.5',
          'break-words whitespace-pre-wrap',
          'empty:before:content-[""]', // handled by placeholder above
          disabled && 'opacity-50 cursor-not-allowed',
          // Rich text styles
          '[&_b]:font-semibold [&_strong]:font-semibold',
          '[&_i]:italic [&_em]:italic',
          '[&_u]:underline',
          '[&_code]:bg-muted/50 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs',
          '[&_pre]:bg-muted/50 [&_pre]:p-2 [&_pre]:rounded [&_pre]:text-xs [&_pre]:overflow-x-auto',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:pl-3 [&_blockquote]:italic',
          '[&_ul]:list-disc [&_ul]:pl-5',
          '[&_ol]:list-decimal [&_ol]:pl-5',
          '[&_li]:my-0.5',
          '[&_a]:text-primary [&_a]:underline',
          '[&_h1]:text-lg [&_h1]:font-bold [&_h1]:my-1',
          '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:my-1',
          '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:my-1',
          '[&_table]:border-collapse [&_table]:w-full',
          '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:text-xs',
          '[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-xs [&_th]:font-semibold [&_th]:bg-muted/30',
          '[&_img]:max-w-full [&_img]:max-h-40 [&_img]:rounded [&_img]:my-1',
          // Code blocks
          '[&_.rich-code-block]:bg-zinc-900 [&_.rich-code-block]:text-green-400',
          '[&_.rich-code-block]:p-3 [&_.rich-code-block]:rounded-lg',
          '[&_.rich-code-block]:font-mono [&_.rich-code-block]:text-xs',
          '[&_.rich-code-block]:my-2 [&_.rich-code-block]:overflow-x-auto',
          '[&_.rich-code-block]:border [&_.rich-code-block]:border-zinc-700',
          '[&_.rich-inline-code]:bg-muted/50 [&_.rich-inline-code]:px-1.5',
          '[&_.rich-inline-code]:rounded [&_.rich-inline-code]:font-mono',
          '[&_.rich-inline-code]:text-xs [&_.rich-inline-code]:text-orange-400',
          // Scrollbar
          '[&::-webkit-scrollbar]:w-1',
          '[&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full',
        )}
        style={{ wordBreak: 'break-word' }}
      />
    </div>
  );
}

/**
 * Format plain text with code block detection and syntax highlighting
 */
function formatPlainTextWithCode(text: string): string {
  // Detect code blocks (indented lines, or lines with code patterns)
  const lines = text.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  
  for (const line of lines) {
    // Detect fenced code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        const code = codeLines.join('\n')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        result.push(`<pre class="rich-code-block"><code>${code}</code></pre>`);
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }
    
    // Detect inline code patterns
    const escaped = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/`([^`]+)`/g, '<code class="rich-inline-code">$1</code>');
    
    result.push(escaped || '<br>');
  }
  
  // Unclosed code block
  if (inCodeBlock && codeLines.length > 0) {
    const code = codeLines.join('\n')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    result.push(`<pre class="rich-code-block"><code>${code}</code></pre>`);
  }
  
  return result.join('<br>');
}

/**
 * Clean pasted HTML — keep basic formatting, remove junk
 */
function cleanPastedHtml(html: string): string {
  // Create a temporary element to parse HTML
  if (typeof window === 'undefined') return html;
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Remove scripts, styles, comments
  doc.querySelectorAll('script, style, meta, link, title').forEach(el => el.remove());
  
  // Remove all style attributes (keep semantic tags)
  doc.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
  
  // Remove class attributes (we'll use our own styles)
  doc.querySelectorAll('[class]').forEach(el => el.removeAttribute('class'));
  
  // Keep these tags: b, strong, i, em, u, code, pre, blockquote, ul, ol, li, a, h1-h6, table, tr, td, th, img, br, p, div
  const allowedTags = new Set([
    'b', 'strong', 'i', 'em', 'u', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'br', 'p', 'div', 'span',
  ]);
  
  // Remove disallowed tags but keep their content
  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (!allowedTags.has(tag)) {
          // Replace with its children
          while (el.firstChild) {
            node.insertBefore(el.firstChild, el);
          }
          node.removeChild(el);
        } else {
          // Clean attributes on allowed tags
          const attrs = Array.from(el.attributes);
          for (const attr of attrs) {
            if (attr.name !== 'href' && attr.name !== 'src' && attr.name !== 'alt') {
              el.removeAttribute(attr.name);
            }
          }
          walk(el);
        }
      }
    }
  };
  
  walk(doc.body);
  
  return doc.body.innerHTML;
}
