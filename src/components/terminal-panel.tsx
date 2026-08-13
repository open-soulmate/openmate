'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as TerminalIcon, X, Maximize2, Minimize2 } from 'lucide-react';

interface TerminalPanelProps {
  apiBase: string;
  token: string;
}

export function TerminalPanel({ apiBase, token }: TerminalPanelProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<any>(null);

  const initTerminal = useCallback(async () => {
    if (!termRef.current || connected) return;
    const { Terminal } = await import('@xterm/xterm');
    const { FitAddon } = await import('@xterm/addon-fit');
    const { WebLinksAddon } = await import('@xterm/addon-web-links');
    // CSS loaded via global import

    const term = new Terminal({
      theme: { background: '#0a0a0f', foreground: '#e4e4e7', cursor: '#7c3aed', selectionBackground: '#7c3aed33' },
      fontFamily: 'monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
    });
    const fitAddon = new FitAddon();
    const webLinks = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinks);
    term.open(termRef.current);
    fitAddon.fit();
    fitAddonRef.current = fitAddon;

    // WebSocket to backend terminal
    const wsUrl = `ws://${window.location.hostname}:8090/ws/terminal?token=${token}`;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => { setConnected(true); term.focus(); };
    ws.onmessage = (e) => term.write(e.data);
    ws.onclose = () => { setConnected(false); term.write('\r\n\x1b[31m[断开连接]\x1b[0m\r\n'); };
    ws.onerror = () => term.write('\r\n\x1b[31m[连接失败]\x1b[0m\r\n');
    wsRef.current = ws;

    term.onData((data) => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'input', data })));
    term.onResize(({ cols, rows }) => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'resize', cols, rows })));

    const onResize = () => fitAddon.fit();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); ws.close(); term.dispose(); };
  }, [token, connected]);

  useEffect(() => {
    if (open) initTerminal();
    return () => { wsRef.current?.close(); };
  }, [open, initTerminal]);

  return (
    <>
      {/* Toggle button */}
      <button onClick={() => setOpen(!open)} className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors" title="终端">
        <TerminalIcon className="w-5 h-5" />
      </button>

      {/* Terminal panel */}
      {open && (
        <div className={`fixed z-40 bg-[#0a0a0f] border border-border rounded-t-xl shadow-2xl transition-all ${maximized ? 'inset-0' : 'bottom-0 right-14 w-[700px] h-[400px]'}`}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[#111118] rounded-t-xl">
            <div className="flex items-center gap-2">
              <TerminalIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">终端</span>
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMaximized(!maximized)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div ref={termRef} className="w-full h-[calc(100%-36px)]" />
        </div>
      )}
    </>
  );
}
