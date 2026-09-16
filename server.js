const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { createProxyServer } = require('http-proxy');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// WebSocket代理：/ws/acp → ws://127.0.0.1:8092/ws/acp
const wsProxy = createProxyServer({
  target: 'ws://127.0.0.1:8092',
  ws: true,
});

wsProxy.on('error', (err, req, res) => {
  console.error('[ws-proxy] error:', err.message);
  if (res && !res.headersSent) {
    res.writeHead(502);
    res.end('Bad Gateway');
  }
});

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  // WebSocket升级：只代理/ws/acp路径
  server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/ws/acp')) {
      wsProxy.ws(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
