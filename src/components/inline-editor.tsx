'use client';
import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Copy, Check, X, Save, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface InlineEditorProps {
  code: string;
  language: string;
  fileName?: string;
  readOnly?: boolean;
  onApply?: (code: string) => void;
}

export function InlineEditor({ code, language, fileName, readOnly = false, onApply }: InlineEditorProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState(code);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(isEditing ? editedCode : code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code, editedCode, isEditing]);

  const handleApply = useCallback(() => {
    onApply?.(editedCode);
    setIsEditing(false);
  }, [editedCode, onApply]);

  const handleCancel = useCallback(() => {
    setEditedCode(code);
    setIsEditing(false);
  }, [code]);

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border/50 bg-[#0d0d14]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e2e] text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{language || 'text'}</span>
          {fileName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/80">
              {fileName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!readOnly && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/50"
            >
              <Pencil className="w-3 h-3" />
              <span>{t('markdown.edit')}</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/50"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? t('markdown.copied') : t('markdown.copy')}
          </button>
        </div>
      </div>

      {/* Editor area */}
      {isEditing ? (
        <div className="border-t border-border/30">
          <MonacoEditor
            height="200px"
            language={language || 'text'}
            value={editedCode}
            onChange={(value) => setEditedCode(value || '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: 20,
              padding: { top: 8, bottom: 8 },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              tabSize: 2,
              renderLineHighlight: 'none',
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
              },
            }}
          />
          {/* Action bar */}
          <div className="flex items-center justify-end gap-2 px-3 py-2 bg-[#1e1e2e] border-t border-border/30">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              {t('markdown.cancel')}
            </button>
            {onApply && (
              <button
                onClick={handleApply}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                {t('markdown.apply')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <MonacoEditor
          height={`${Math.min(Math.max(code.split('\n').length * 20, 60), 300)}px`}
          language={language || 'text'}
          value={code}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 20,
            padding: { top: 8, bottom: 8 },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            renderLineHighlight: 'none',
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            domReadOnly: true,
            contextmenu: false,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
            },
          }}
        />
      )}
    </div>
  );
}
