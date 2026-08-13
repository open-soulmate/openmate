'use client';
import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border/50">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e2e] text-xs text-muted-foreground">
        <span>{language || 'text'}</span>
        <button onClick={handleCopy} className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground">
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <SyntaxHighlighter language={language || 'text'} style={oneDark} customStyle={{ margin: 0, fontSize: '13px', lineHeight: '1.5', background: '#0d0d14' }}>
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

export function MarkdownContent({ content }: { content: string }) {
  if (!content) return null;
  const parts: React.ReactNode[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={lastIndex} className="whitespace-pre-wrap">{content.slice(lastIndex, match.index)}</span>);
    }
    parts.push(<CodeBlock key={match.index} language={match[1]} code={match[2].trimEnd()} />);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push(<span key={lastIndex} className="whitespace-pre-wrap">{content.slice(lastIndex)}</span>);
  }
  return <>{parts}</>;
}
