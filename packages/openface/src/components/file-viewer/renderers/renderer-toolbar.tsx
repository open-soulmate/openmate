import { Download, Copy, Check, Printer, Save, Sparkles, X, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

interface RendererToolbarProps {
  fileName: string;
  fileUrl?: string;
  category?: string;
  children?: ReactNode;
  onCopy?: () => void;
  copied?: boolean;
  onPrint?: () => void;
  onSave?: () => void;
  dirty?: boolean;
  /** Send content to AI for collaborative editing */
  onSendToAgent?: (instruction: string) => Promise<void>;
}

/**
 * Unified toolbar for all file renderers.
 * Layout: [badge] [children...] ←spacer→ [fileName] | [copy] [print] [save] [ai] [download]
 */
export function RendererToolbar({ fileName, fileUrl, category, children, onCopy, copied: copiedProp, onPrint, onSave, dirty, onSendToAgent }: RendererToolbarProps) {
  const copied = copiedProp ?? false;
  const [showAI, setShowAI] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [sending, setSending] = useState(false);

  const handleDownload = useCallback(() => {
    if (!fileUrl) return;
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = fileName;
    a.click();
  }, [fileUrl, fileName]);

  const handleSendToAI = useCallback(async () => {
    if (!instruction.trim() || !onSendToAgent) return;
    setSending(true);
    try {
      await onSendToAgent(instruction.trim());
      setInstruction('');
      setShowAI(false);
    } catch {}
    setSending(false);
  }, [instruction, onSendToAgent]);

  const badgeColors: Record<string, string> = {
    PDF: 'bg-red-500/20 text-red-400',
    HTML: 'bg-orange-500/20 text-orange-400',
    MD: 'bg-blue-500/20 text-blue-400',
    IMG: 'bg-green-500/20 text-green-400',
    VID: 'bg-purple-500/20 text-purple-400',
    AUDIO: 'bg-pink-500/20 text-pink-400',
    XLS: 'bg-emerald-500/20 text-emerald-400',
    DOC: 'bg-sky-500/20 text-sky-400',
    CODE: 'bg-yellow-500/20 text-yellow-400',
    JSON: 'bg-amber-500/20 text-amber-400',
    CSV: 'bg-teal-500/20 text-teal-400',
    TXT: 'bg-gray-500/20 text-gray-400',
    SVG: 'bg-pink-500/20 text-pink-400',
    PPT: 'bg-orange-500/20 text-orange-400',
    ZIP: 'bg-yellow-500/20 text-yellow-400',
    LOG: 'bg-gray-500/20 text-gray-400',
  };

  return (
    <div className="shrink-0 bg-[#1a1a2e]">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/30">
        {category && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeColors[category] || 'bg-muted/30 text-muted-foreground'}`}>
            {category}
          </span>
        )}
        {category && children && <div className="w-px h-4 bg-border/30 mx-0.5" />}
        {children}
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground/50 truncate max-w-[200px] mx-2">{fileName}</span>
        <div className="w-px h-4 bg-border/30 mx-0.5" />

        {onCopy && (
          <button onClick={onCopy} className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground transition-colors" title="复制">
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
        {onPrint && (
          <button onClick={onPrint} className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground transition-colors" title="打印">
            <Printer className="w-3.5 h-3.5" />
          </button>
        )}
        {onSave && (
          <button onClick={onSave}
            className={`p-1.5 rounded transition-colors ${dirty ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'hover:bg-muted/30 text-muted-foreground'}`}
            title="保存">
            <Save className="w-3.5 h-3.5" />
          </button>
        )}
        {onSendToAgent && (
          <button onClick={() => setShowAI(!showAI)}
            className={`p-1.5 rounded transition-colors ${showAI ? 'bg-primary/20 text-primary' : 'hover:bg-muted/30 text-muted-foreground'}`}
            title="AI协作编辑">
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        )}
        {fileUrl && (
          <button onClick={handleDownload} className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground transition-colors" title="下载">
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* AI instruction bar */}
      {showAI && onSendToAgent && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/30">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          <input
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendToAI(); }}}
            placeholder="告诉AI你想怎么改..."
            className="flex-1 bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground/50"
            autoFocus
            disabled={sending}
          />
          <button onClick={handleSendToAI} disabled={!instruction.trim() || sending}
            className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-xs disabled:opacity-50 transition-opacity flex items-center gap-1">
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            <span>{sending ? '处理中' : '发送'}</span>
          </button>
          <button onClick={() => { setShowAI(false); setInstruction(''); }} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
