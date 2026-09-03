"""投标文档引擎 — Word 文档导出器

使用 lxml + zipfile 直接操作 docx XML，实现精确的格式控制：
- 标题样式：H1黑体二号, H2宋体三号, H3宋体四号, 正文仿宋小四
- 多级编号（技术方案章节）
- 目录字段插入（TOC field code）
- 分节符（页码控制）
- 横向页面（≥8列的表格）
"""

import logging
import os
import re
import zipfile
from copy import deepcopy
from pathlib import Path
from typing import Optional

from .models import OutlineNode, Project

logger = logging.getLogger("acp-proxy.bidding.exporter")

# ── 字号映射（磅值）─────────────────────────────────────────────
FONT_SIZES = {
    "二号": 22,    # 22pt
    "三号": 16,    # 16pt
    "四号": 14,    # 14pt
    "小四": 12,    # 12pt
    "五号": 10.5,  # 10.5pt
}

# ── 字体映射 ────────────────────────────────────────────────────
FONT_FAMILIES = {
    "黑体": "SimHei",
    "宋体": "SimSun",
    "仿宋": "FangSong",
    "楷体": "KaiTi",
}

# ── docx XML 模板 ───────────────────────────────────────────────

CONTENT_TYPES_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>"""

RELS_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

WORD_RELS_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>"""

SETTINGS_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:updateFields w:val="true"/>
</w:settings>"""


def _pt_to_half_pt(pt: float) -> int:
    """磅值转 half-point"""
    return int(pt * 2)


def _make_styles_xml() -> str:
    """生成 styles.xml，定义标题和正文样式"""
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <!-- 正文样式 -->
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="{FONT_FAMILIES['仿宋']}" w:eastAsia="{FONT_FAMILIES['仿宋']}" w:hAnsi="{FONT_FAMILIES['仿宋']}"/>
      <w:sz w:val="{_pt_to_half_pt(FONT_SIZES['小四'])}"/>
      <w:szCs w:val="{_pt_to_half_pt(FONT_SIZES['小四'])}"/>
    </w:rPr>
    <w:pPr>
      <w:spacing w:line="360" w:lineRule="auto"/>
    </w:pPr>
  </w:style>

  <!-- Heading 1: 黑体二号 -->
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:outlineLvl w:val="0"/>
      <w:spacing w:before="240" w:after="120"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="{FONT_FAMILIES['黑体']}" w:eastAsia="{FONT_FAMILIES['黑体']}" w:hAnsi="{FONT_FAMILIES['黑体']}"/>
      <w:b/>
      <w:sz w:val="{_pt_to_half_pt(FONT_SIZES['二号'])}"/>
      <w:szCs w:val="{_pt_to_half_pt(FONT_SIZES['二号'])}"/>
    </w:rPr>
  </w:style>

  <!-- Heading 2: 宋体三号 -->
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:outlineLvl w:val="1"/>
      <w:spacing w:before="200" w:after="100"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="{FONT_FAMILIES['宋体']}" w:eastAsia="{FONT_FAMILIES['宋体']}" w:hAnsi="{FONT_FAMILIES['宋体']}"/>
      <w:b/>
      <w:sz w:val="{_pt_to_half_pt(FONT_SIZES['三号'])}"/>
      <w:szCs w:val="{_pt_to_half_pt(FONT_SIZES['三号'])}"/>
    </w:rPr>
  </w:style>

  <!-- Heading 3: 宋体四号 -->
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:outlineLvl w:val="2"/>
      <w:spacing w:before="160" w:after="80"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="{FONT_FAMILIES['宋体']}" w:eastAsia="{FONT_FAMILIES['宋体']}" w:hAnsi="{FONT_FAMILIES['宋体']}"/>
      <w:b/>
      <w:sz w:val="{_pt_to_half_pt(FONT_SIZES['四号'])}"/>
      <w:szCs w:val="{_pt_to_half_pt(FONT_SIZES['四号'])}"/>
    </w:rPr>
  </w:style>

  <!-- TOC 标题 -->
  <w:style w:type="paragraph" w:styleId="TOCHeading">
    <w:name w:val="TOC Heading"/>
    <w:basedOn w:val="Heading1"/>
    <w:pPr><w:outlineLvl w:val="9"/></w:pPr>
  </w:style>
</w:styles>"""


def _make_numbering_xml() -> str:
    """生成多级编号定义（技术方案章节用）"""
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="425" w:hanging="425"/></w:pPr>
    </w:lvl>
    <w:lvl w:ilvl="1">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1.%2"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="850" w:hanging="850"/></w:pPr>
    </w:lvl>
    <w:lvl w:ilvl="2">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1.%2.%3"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="1275" w:hanging="1275"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1">
    <w:abstractNumId w:val="0"/>
  </w:num>
</w:numbering>"""


def _make_toc_xml() -> list[str]:
    """生成目录字段代码 XML 片段"""
    return [
        '<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr>'
        '<w:r><w:t>目  录</w:t></w:r></w:p>',
        '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>'
        '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>'
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
        '<w:r><w:t>（请在Word中右键更新域以生成目录）</w:t></w:r>'
        '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
    ]


def _text_to_runs(text: str) -> str:
    """将文本转换为 w:r 片段（处理特殊字符）"""
    from xml.sax.saxutils import escape
    escaped = escape(text)
    return f'<w:r><w:rPr><w:rFonts w:ascii="{FONT_FAMILIES["仿宋"]}" w:eastAsia="{FONT_FAMILIES["仿宋"]}" w:hAnsi="{FONT_FAMILIES["仿宋"]}"/><w:sz w:val="{_pt_to_half_pt(FONT_SIZES["小四"])}"/><w:szCs w:val="{_pt_to_half_pt(FONT_SIZES["小四"])}</w:rPr><w:t xml:space="preserve">{escaped}</w:t></w:r>'


def _md_to_docx_paragraphs(md_text: str) -> list[str]:
    """将 markdown 转换为 docx XML 段落列表"""
    from xml.sax.saxutils import escape

    paragraphs = []
    lines = md_text.split('\n')
    in_table = False
    table_rows = []

    for line in lines:
        stripped = line.strip()

        # 空行
        if not stripped:
            if in_table and table_rows:
                paragraphs.append(_build_table_xml(table_rows))
                table_rows = []
                in_table = False
            continue

        # 表格行
        if stripped.startswith('|') and stripped.endswith('|'):
            cells = [c.strip() for c in stripped.split('|')[1:-1]]
            if all(set(c) <= {'-', ' ', ':'} for c in cells):
                continue  # 跳过分隔行
            table_rows.append(cells)
            in_table = True
            continue

        if in_table and table_rows:
            paragraphs.append(_build_table_xml(table_rows))
            table_rows = []
            in_table = False

        # 标题
        if stripped.startswith('#'):
            level = len(stripped) - len(stripped.lstrip('#'))
            title = stripped.lstrip('#').strip()
            style = f"Heading{min(level, 3)}"
            paragraphs.append(
                f'<w:p><w:pPr><w:pStyle w:val="{style}"/>'
                f'<w:numPr><w:ilvl w:val="{level-1}"/><w:numId w:val="1"/></w:numPr></w:pPr>'
                f'<w:r><w:rPr><w:b/><w:rFonts w:eastAsia="{FONT_FAMILIES["宋体"]}"/>'
                f'<w:sz w:val="{_pt_to_half_pt(FONT_SIZES["三号"])}"/>'
                f'<w:szCs w:val="{_pt_to_half_pt(FONT_SIZES["三号"])}</w:rPr>'
                f'<w:t xml:space="preserve">{escape(title)}</w:t></w:r></w:p>'
            )
            continue

        # 列表项
        if stripped.startswith(('- ', '* ', '+ ')):
            text = stripped[2:]
            paragraphs.append(
                f'<w:p><w:pPr><w:ind w:left="425"/></w:pPr>'
                f'<w:r><w:t xml:space="preserve">• {escape(text)}</w:t></w:r></w:p>'
            )
            continue

        # 普通段落
        paragraphs.append(
            f'<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>'
            f'<w:r><w:rPr><w:rFonts w:ascii="{FONT_FAMILIES["仿宋"]}" w:eastAsia="{FONT_FAMILIES["仿宋"]}" w:hAnsi="{FONT_FAMILIES["仿宋"]}"/>'
            f'<w:sz w:val="{_pt_to_half_pt(FONT_SIZES["小四"])}"/>'
            f'<w:szCs w:val="{_pt_to_half_pt(FONT_SIZES["小四"])}</w:rPr>'
            f'<w:t xml:space="preserve">{escape(stripped)}</w:t></w:r></w:p>'
        )

    # 处理最后的表格
    if in_table and table_rows:
        paragraphs.append(_build_table_xml(table_rows))

    return paragraphs


def _build_table_xml(rows: list[list[str]]) -> str:
    """构建表格 XML（自动判断是否需要横向页面）"""
    from xml.sax.saxutils import escape

    max_cols = max(len(r) for r in rows) if rows else 0
    need_landscape = max_cols >= 8

    xml_parts = []

    # 如果需要横向，插入分节符
    if need_landscape:
        xml_parts.append(
            '<w:p><w:pPr><w:sectPr>'
            '<w:pgSz w:orient="landscape" w:w="16838" w:h="11906"/>'
            '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>'
            '</w:sectPr></w:pPr></w:p>'
        )

    xml_parts.append(
        '<w:tbl>'
        '<w:tblPr>'
        '<w:tblStyle w:val="TableGrid"/>'
        '<w:tblW w:w="0" w:type="auto"/>'
        '<w:tblBorders>'
        '<w:top w:val="single" w:sz="4" w:space="0"/>'
        '<w:left w:val="single" w:sz="4" w:space="0"/>'
        '<w:bottom w:val="single" w:sz="4" w:space="0"/>'
        '<w:right w:val="single" w:sz="4" w:space="0"/>'
        '<w:insideH w:val="single" w:sz="4" w:space="0"/>'
        '<w:insideV w:val="single" w:sz="4" w:space="0"/>'
        '</w:tblBorders>'
        '</w:tblPr>'
    )

    for i, row in enumerate(rows):
        xml_parts.append('<w:tr>')
        for cell in row:
            is_header = (i == 0)
            rpr = ('<w:rPr><w:b/><w:rFonts w:eastAsia="SimSun"/>'
                   '<w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr>') if is_header else ''
            xml_parts.append(
                '<w:tc>'
                '<w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>'
                f'<w:p><w:r>{rpr}<w:t xml:space="preserve">{escape(cell)}</w:t></w:r></w:p>'
                '</w:tc>'
            )
        xml_parts.append('</w:tr>')

    xml_parts.append('</w:tbl>')

    # 恢复纵向页面
    if need_landscape:
        xml_parts.append(
            '<w:p><w:pPr><w:sectPr>'
            '<w:pgSz w:w="11906" w:h="16838"/>'
            '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>'
            '</w:sectPr></w:pPr></w:p>'
        )

    return '\n'.join(xml_parts)


def _collect_content(node: OutlineNode, depth: int = 0) -> list[str]:
    """递归收集大纲节点内容为 docx XML 段落"""
    paragraphs = []

    if node.title and node.id != "root":
        level = min(depth + 1, 3)
        style = f"Heading{level}"
        from xml.sax.saxutils import escape
        paragraphs.append(
            f'<w:p><w:pPr><w:pStyle w:val="{style}"/>'
            f'<w:numPr><w:ilvl w:val="{level-1}"/><w:numId w:val="1"/></w:numPr></w:pPr>'
            f'<w:r><w:t xml:space="preserve">{escape(node.title)}</w:t></w:r></w:p>'
        )

    if node.content:
        paragraphs.extend(_md_to_docx_paragraphs(node.content))

    for child in node.children:
        paragraphs.extend(_collect_content(child, depth + 1))

    return paragraphs


def export_to_word(project: Project, output_path: Optional[str] = None) -> str:
    """导出投标项目为 Word 文档

    Args:
        project: 投标项目
        output_path: 输出路径（默认在 data/ 目录下）

    Returns:
        生成的 docx 文件路径
    """
    if not output_path:
        data_dir = Path(__file__).parent.parent / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        output_path = str(data_dir / f"bid_{project.id}.docx")

    # 收集所有内容
    all_paragraphs = []

    # 封面页
    from xml.sax.saxutils import escape
    project_name = project.name or project.parse_result.project_info.name if project.parse_result else "投标方案"
    all_paragraphs.append(
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="4800"/></w:pPr>'
        f'<w:r><w:rPr><w:b/><w:rFonts w:ascii="{FONT_FAMILIES["黑体"]}" w:eastAsia="{FONT_FAMILIES["黑体"]}"/>'
        f'<w:sz w:val="{_pt_to_half_pt(FONT_SIZES["二号"])}"/>'
        f'<w:szCs w:val="{_pt_to_half_pt(FONT_SIZES["二号"])}</w:rPr>'
        f'<w:t xml:space="preserve">{escape(project_name)}</w:t></w:r></w:p>'
    )
    all_paragraphs.append(
        '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>'
        f'<w:r><w:rPr><w:rFonts w:eastAsia="{FONT_FAMILIES["宋体"]}"/>'
        f'<w:sz w:val="{_pt_to_half_pt(FONT_SIZES["三号"])}"/>'
        f'<w:szCs w:val="{_pt_to_half_pt(FONT_SIZES["三号"])}</w:rPr>'
        '<w:t>投 标 文 件</w:t></w:r></w:p>'
    )
    # 分页
    all_paragraphs.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')

    # 目录
    all_paragraphs.extend(_make_toc_xml())
    all_paragraphs.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')

    # 正文内容
    if project.outline:
        all_paragraphs.extend(_collect_content(project.outline))
    else:
        all_paragraphs.append(
            '<w:p><w:r><w:t>（暂无内容，请先生成大纲和章节内容）</w:t></w:r></w:p>'
        )

    # 构建 document.xml
    body_content = '\n'.join(all_paragraphs)
    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    {body_content}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
      <w:pgNumType w:start="1"/>
    </w:sectPr>
  </w:body>
</w:document>"""

    # 打包为 docx（ZIP格式）
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', CONTENT_TYPES_XML)
        zf.writestr('_rels/.rels', RELS_XML)
        zf.writestr('word/_rels/document.xml.rels', WORD_RELS_XML)
        zf.writestr('word/document.xml', document_xml)
        zf.writestr('word/styles.xml', _make_styles_xml())
        zf.writestr('word/numbering.xml', _make_numbering_xml())
        zf.writestr('word/settings.xml', SETTINGS_XML)

    logger.info(f"Word文档导出完成: {output_path}")
    return output_path
