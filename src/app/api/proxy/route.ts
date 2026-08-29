import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side web proxy — fetches external pages and serves them from our origin.
 * This allows iframe links to navigate within the workspace (same-origin).
 *
 * Usage: /api/proxy?url=https://example.com
 */

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(url);
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      return new NextResponse('Only http/https URLs allowed', { status: 400 });
    }
  } catch {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  try {
    const resp = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    const contentType = resp.headers.get('content-type') || '';

    // Only proxy HTML pages — other resources (images, css, js) load directly
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      // Pass through non-HTML responses as-is
      const body = await resp.arrayBuffer();
      return new NextResponse(body, {
        status: resp.status,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    let html = await resp.text();

    // Inject <base> tag so relative URLs resolve to the original site
    const baseUrl = `${targetUrl.protocol}//${targetUrl.host}`;
    const baseTag = `<base href="${baseUrl}/" target="_self">`;
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${baseTag}`);
    } else if (html.includes('<HEAD>')) {
      html = html.replace('<HEAD>', `<HEAD>${baseTag}`);
    } else {
      html = baseTag + html;
    }

    // Inject script to intercept link clicks and route through proxy
    const interceptScript = `
<script>
(function() {
  document.addEventListener('click', function(e) {
    var link = e.target.closest('a');
    if (!link || !link.href) return;
    var href = link.href;
    // Don't intercept javascript: or anchor links
    if (href.startsWith('javascript:') || href.startsWith('#')) return;
    e.preventDefault();
    // Navigate through proxy
    var proxyUrl = '/api/proxy?url=' + encodeURIComponent(href);
    if (link.target === '_blank' || e.ctrlKey || e.metaKey) {
      // Open in new workspace tab — post message to parent
      window.parent.postMessage({ type: 'proxy-navigate', url: href, newTab: true }, '*');
    } else {
      window.location.href = proxyUrl;
    }
  }, true);
  // Also intercept form submissions
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form.action) return;
    e.preventDefault();
    var formData = new FormData(form);
    var params = new URLSearchParams(formData).toString();
    var actionUrl = new URL(form.action, document.baseURI);
    var proxyUrl = '/api/proxy?url=' + encodeURIComponent(actionUrl.toString() + '?' + params);
    window.location.href = proxyUrl;
  }, true);
})();
</script>`;

    // Inject before </head> or </body> or at end
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${interceptScript}</head>`);
    } else if (html.includes('</HEAD>')) {
      html = html.replace('</HEAD>', `${interceptScript}</HEAD>`);
    } else {
      html += interceptScript;
    }

    // Rewrite remaining absolute URLs for the original domain to go through proxy
    // Only rewrite href/src attributes that point to the original domain
    html = html.replace(/(href|src|action)=(["'])(https?:\/\/[^"']+)\2/gi, (match, attr, quote, hrefUrl) => {
      try {
        const u = new URL(hrefUrl);
        if (u.host === targetUrl.host) {
          return `${attr}=${quote}/api/proxy?url=${encodeURIComponent(hrefUrl)}${quote}`;
        }
      } catch {}
      return match;
    });

    return new NextResponse(html, {
      status: resp.status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
        // Allow iframe embedding from same origin
        'X-Frame-Options': 'SAMEORIGIN',
      },
    });
  } catch (err: any) {
    const message = err?.name === 'TimeoutError' ? 'Request timed out' : err?.message || 'Fetch failed';
    return new NextResponse(`<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#888;"><p>Failed to load: ${message}</p></body></html>`, {
      status: 502,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}
