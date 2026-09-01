#!/usr/bin/env python3
"""Simple HTTPS reverse proxy for OpenMate dev server."""
import http.server
import ssl
import urllib.request
import sys
import os

TARGET = "http://127.0.0.1:3002"
CERT = os.path.join(os.path.dirname(__file__), "certs", "cert.pem")
KEY = os.path.join(os.path.dirname(__file__), "certs", "key.pem")
PORT = 3443

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self._proxy()
    def do_POST(self):
        self._proxy()
    def do_PUT(self):
        self._proxy()
    def do_DELETE(self):
        self._proxy()
    def do_PATCH(self):
        self._proxy()
    def do_OPTIONS(self):
        self._proxy()

    def _proxy(self):
        url = TARGET + self.path
        body = None
        if 'Content-Length' in self.headers:
            body = self.rfile.read(int(self.headers['Content-Length']))

        headers = {k: v for k, v in self.headers.items()
                   if k.lower() not in ('host', 'transfer-encoding')}

        req = urllib.request.Request(url, data=body, headers=headers, method=self.command)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                self.send_response(resp.status)
                for k, v in resp.getheaders():
                    if k.lower() not in ('transfer-encoding',):
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(resp.read())
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(f"Proxy error: {e}".encode())

    def log_message(self, fmt, *args):
        pass  # silent

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(CERT, KEY)

server = http.server.HTTPServer(("0.0.0.0", PORT), ProxyHandler)
server.socket = ctx.wrap_socket(server.socket, server_side=True)
print(f"HTTPS proxy on https://0.0.0.0:{PORT} -> {TARGET}", flush=True)
server.serve_forever()
