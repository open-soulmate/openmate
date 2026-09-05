/** FileViewer — OpenFace unified file viewer/editor */

export interface FileViewerProps {
  /** Original file name (used to detect format) */
  fileName: string;
  /** MIME type (optional, inferred from fileName if missing) */
  mimeType?: string;
  /** File content as data URL (base64) or blob URL */
  fileUrl?: string;
  /** File content as ArrayBuffer */
  fileBuffer?: ArrayBuffer;
  /** Fallback iframe URL for legacy formats (e.g. kkFileView) */
  fallbackIframeUrl?: string;
  /** Called when user saves edits */
  onSave?: (content: string, fileName: string) => void;
  /** Send content to AI for collaborative editing. Returns new content. */
  onSendToAgent?: (content: string, instruction: string, fileName: string) => Promise<string>;
  /** Error callback */
  onError?: (err: Error) => void;
  /** Extra className */
  className?: string;
}

export type FileCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'markdown'
  | 'code'
  | 'text'
  | 'log'
  | 'csv'
  | 'json'
  | 'html'
  | 'svg'
  | 'archive'
  | 'mermaid'
  | 'plantuml'
  | 'drawio'
  | 'xmind'
  | 'sqlite'
  | 'email'
  | 'geojson'
  | 'kml'
  | 'gpx'
  | 'typst'
  | 'epub'
  | 'ofd'
  | 'excalidraw'
  | 'model3d'
  | 'shp'
  | 'parquet'
  | 'cad'
  | 'psd'
  | 'gitbundle'
  | 'font'
  | 'hls'
  | 'midi'
  | 'unknown';

/** Detect file category from name + mime type */
export function detectCategory(fileName: string, mimeType?: string): FileCategory {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mime = mimeType?.toLowerCase() || '';

  // Images (non-svg)
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico', 'avif'].includes(ext)) return 'image';
  // SVG gets its own renderer
  if (ext === 'svg') return 'svg';
  // Video
  if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
  // Audio
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'opus'].includes(ext)) return 'audio';
  // PDF
  if (ext === 'pdf') return 'pdf';
  // Office
  if (ext === 'docx') return 'docx';
  if (['xlsx', 'xls'].includes(ext)) return 'xlsx';
  if (['pptx', 'ppt'].includes(ext)) return 'pptx';
  // Markdown
  if (['md', 'markdown', 'mdx'].includes(ext)) return 'markdown';
  // CSV/TSV
  if (['csv', 'tsv'].includes(ext)) return 'csv';
  // JSON/JSONL
  if (['json', 'jsonl'].includes(ext)) return 'json';
  // HTML
  if (['html', 'htm'].includes(ext)) return 'html';
  // Archives
  if (['zip', '7z', 'tar', 'gz', 'tgz', 'tar.gz', 'bz2', 'xz', 'rar'].includes(ext)) return 'archive';
  // Log files
  if (['log'].includes(ext)) return 'log';

  // ---- 自定义渲染器格式 ----
  // Mermaid
  if (['mmd', 'mermaid'].includes(ext)) return 'mermaid';
  // PlantUML
  if (['puml', 'plantuml'].includes(ext)) return 'plantuml';
  // Draw.io
  if (['drawio', 'dio'].includes(ext)) return 'drawio';
  // XMind
  if (ext === 'xmind') return 'xmind';
  // SQLite
  if (['sqlite', 'sqlite3', 'db'].includes(ext)) return 'sqlite';
  // 邮件文件
  if (['eml', 'msg', 'mbox'].includes(ext)) return 'email';
  // GeoJSON
  if (ext === 'geojson') return 'geojson';
  // KML
  if (['kml', 'kmz'].includes(ext)) return 'kml';
  // GPX
  if (ext === 'gpx') return 'gpx';
  // Typst
  if (ext === 'typ') return 'typst';
  // EPUB 电子书
  if (ext === 'epub') return 'epub';
  // OFD 国标文档
  if (ext === 'ofd') return 'ofd';
  // Excalidraw
  if (ext === 'excalidraw') return 'excalidraw';
  // 3D 模型
  if (['gltf', 'glb', 'obj', 'stl', 'ply'].includes(ext)) return 'model3d';
  // SHP
  if (['shp', 'shx', 'dbf'].includes(ext)) return 'shp';
  // Parquet
  if (ext === 'parquet') return 'parquet';
  // CAD
  if (['dwg', 'dxf', 'dwf'].includes(ext)) return 'cad';
  // PSD
  if (['psd', 'psb'].includes(ext)) return 'psd';
  // Git Bundle
  if (ext === 'bundle') return 'gitbundle';
  // Font
  if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return 'font';
  // HLS
  if (ext === 'm3u8') return 'hls';
  // MIDI
  if (['mid', 'midi'].includes(ext)) return 'midi';

  // SVG by MIME
  if (mime === 'image/svg+xml') return 'svg';
  // Code
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp',
       'cs', 'rb', 'php', 'swift', 'kt', 'sh', 'bash', 'zsh', 'fish',
       'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
       'sql', 'graphql', 'xml', 'css', 'scss', 'less', 'vue', 'svelte'].includes(ext)) return 'code';
  // Text
  if (['txt', 'text', 'rtf', 'odt'].includes(ext)) return 'text';

  // MIME fallback
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'xlsx';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'pptx';
  if (mime.includes('wordprocessing') || mime.includes('word')) return 'docx';
  if (mime === 'text/markdown' || mime === 'text/x-markdown') return 'markdown';
  if (mime === 'text/csv') return 'csv';
  if (mime === 'application/json') return 'json';
  if (mime === 'text/html') return 'html';
  if (mime === 'image/svg+xml') return 'svg';
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('archive')) return 'archive';
  if (mime.startsWith('text/')) return 'text';

  return 'unknown';
}

/** Whether this category supports editing */
export function isEditable(category: FileCategory): boolean {
  return ['code', 'markdown', 'text', 'csv', 'json', 'html', 'svg', 'log', 'mermaid', 'plantuml', 'drawio', 'excalidraw'].includes(category);
}

/** Map category to icon name (lucide-react) */
export function categoryIcon(category: FileCategory): string {
  const map: Record<FileCategory, string> = {
    image: 'Image',
    video: 'Video',
    audio: 'Music',
    pdf: 'FileText',
    docx: 'FileText',
    xlsx: 'Table2',
    pptx: 'Presentation',
    markdown: 'FileCode2',
    code: 'FileCode2',
    text: 'FileText',
    log: 'ScrollText',
    csv: 'Table2',
    json: 'FileJson2',
    html: 'Globe',
    svg: 'PenTool',
    archive: 'Archive',
    mermaid: 'GitBranch',
    plantuml: 'Workflow',
    drawio: 'Network',
    xmind: 'Brain',
    sqlite: 'Database',
    email: 'Mail',
    geojson: 'Map',
    kml: 'MapPin',
    gpx: 'Navigation',
    typst: 'FileCode2',
    epub: 'BookOpen',
    ofd: 'FileText',
    excalidraw: 'Pencil',
    model3d: 'Box',
    shp: 'Map',
    parquet: 'Table2',
    cad: 'Ruler',
    psd: 'Image',
    gitbundle: 'GitBranch',
    font: 'Type',
    hls: 'Film',
    midi: 'Music',
    unknown: 'File',
  };
  return map[category];
}
