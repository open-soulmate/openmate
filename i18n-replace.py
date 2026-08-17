#!/usr/bin/env python3
"""Replace hardcoded Chinese strings with i18n t() calls in 18 files."""
import json, re, os, hashlib

base_dir = "/home/climbing/openmate"

# Read translation files
with open(f'{base_dir}/src/locales/zh.json', 'r') as f:
    zh = json.load(f)
with open(f'{base_dir}/src/locales/en.json', 'r') as f:
    en = json.load(f)
with open(f'{base_dir}/src/locales/ja.json', 'r') as f:
    ja = json.load(f)

# Ensure sections exist
for section in ['cron', 'marketplace', 'capture', 'graph', 'diagnostics', 'vision', 'learn', 'agents', 'workflowBuilder', 'workflow', 'topology', 'vein', 'settings', 'plugins', 'smartCalc', 'common']:
    zh.setdefault(section, {})
    en.setdefault(section, {})
    ja.setdefault(section, {})

# Find existing key for a Chinese value in a section
def find_existing_key(section, zh_value):
    """Find an existing key in zh[section] that has this value"""
    for k, v in zh.get(section, {}).items():
        if v == zh_value:
            return k
    return None

# Generate a deterministic key from text
def gen_key(section, text):
    """Generate a key for a Chinese text, reusing existing if found"""
    existing = find_existing_key(section, text)
    if existing:
        return existing
    h = hashlib.md5(text.encode()).hexdigest()[:5]
    key = f"t{h}"
    # Ensure uniqueness
    if key in zh.get(section, {}):
        for i in range(10):
            key = f"t{h}{i}"
            if key not in zh.get(section, {}):
                break
    return key

# Add translation entry
def add_translation(section, key, zh_val, en_val, ja_val=None):
    zh.setdefault(section, {})[key] = zh_val
    en.setdefault(section, {})[key] = en_val
    ja.setdefault(section, {})[key] = ja_val or en_val

# Translation mappings for common strings
TRANSLATIONS = {
    "定时任务": "Cron Jobs",
    "按Agent分组管理定时任务和计划": "Manage scheduled tasks grouped by Agent",
    "新建任务": "New Task",
    "刷新": "Refresh",
    "总任务数": "Total Tasks",
    "运行中": "Running",
    "已暂停": "Paused",
    "新建定时任务": "New Cron Job",
    "任务名称": "Task Name",
    "可选": "Optional",
    "调度规则": "Schedule Rule",
    "执行提示词": "Execution Prompt",
    "任务指令...": "Task instructions...",
    "投递目标": "Delivery Target",
    "创建": "Create",
    "取消": "Cancel",
    "暂无定时任务": "No cron jobs",
    "个任务 ·": "tasks ·",
    "下次:": "Next:",
    "上次:": "Last:",
    "暂停": "Pause",
    "恢复": "Resume",
    "立即执行": "Run Now",
    "删除": "Delete",
    "技能市场": "Skills Marketplace",
    "发现、安装和管理技能与Agent": "Discover, install and manage skills and Agents",
    "同步全部": "Sync All",
    "技能来源": "Skill Sources",
    "Agent来源": "Agent Sources",
    "已安装技能": "Installed Skills",
    "已安装Agent": "Installed Agents",
    "关闭": "Close",
    "搜索来源...": "Search sources...",
    "暂无{type}来源": "No {type} sources",
    "项": "items",
    "同步": "Sync",
    "内置来源": "Built-in Source",
    "从未同步": "Never synced",
    "刚刚": "Just now",
    "加载失败": "Load failed",
    "同步失败": "Sync failed",
    "采集管理": "Capture Management",
    "浏览器扩展采集的内容，可提升到知识库": "Content from browser extension, can be promoted to knowledge base",
    "总计": "Total",
    "页面采集": "Page Captures",
    "文本采集": "Text Captures",
    "全部": "All",
    "页面": "Page",
    "选文": "Selection",
    "搜索标题、URL或内容...": "Search title, URL or content...",
    "暂无采集内容": "No captured content",
    "使用浏览器扩展采集网页内容": "Use browser extension to capture web content",
    "无标题": "Untitled",
    "入库": "Promote",
    "已采集": "Captured",
    "重复": "Duplicate",
    "已入库": "Promoted",
    "提升到知识库": "Promote to knowledge base",
    "添加实体": "Add Entity",
    "添加关系": "Add Relation",
    "实体": "entities",
    "关系": "relations",
    "实体名称": "Entity Name",
    "描述（可选）": "Description (optional)",
    "选择源实体": "Select source entity",
    "选择目标实体": "Select target entity",
    "关系类型": "Relation Type",
    "创建关系": "Create Relation",
    "类型": "Type",
    "关联关系": "Related Relations",
    "未知": "Unknown",
    "暂无关系": "No relations",
    "删除实体": "Delete Entity",
    "季度销售额": "Quarterly Sales",
    "趋势对比": "Trend Comparison",
    "语言使用分布": "Language Usage",
    "散点图": "Scatter Plot",
    "AI工程": "AI Engineering",
    "向量检索": "Vector Search",
    "混合召回": "Hybrid Retrieval",
    "工具调用": "Tool Calling",
    "多Agent协作": "Multi-Agent Collaboration",
    "AI工程知识图谱": "AI Engineering Knowledge Graph",
    "JSON格式错误": "JSON format error",
    "数学表达式": "Math Expression",
    "快捷表达式": "Quick Expressions",
    "支持的函数和常量": "Supported Functions & Constants",
    "精确值:": "Exact value:",
    "求解": "Solve",
    "计算": "Calculate",
    "单位转换": "Unit Convert",
    "历史": "History",
    "数值": "Value",
    "从": "From",
    "到": "To",
    "转换": "Convert",
    "条记录": "records",
    "清空": "Clear",
    "暂无计算历史": "No calculation history",
    "类型": "Type",
    "长度": "Length",
    "重量": "Weight",
    "温度": "Temperature",
    "速度": "Speed",
    "面积": "Area",
    "体积": "Volume",
    "返回列表": "Back to list",
    "复制ID": "Copy ID",
    "下次执行": "Next Run",
    "上次执行": "Last Run",
    "执行Agent": "Executor Agent",
    "最近错误": "Recent Error",
    "执行历史": "Execution History",
    "暂无执行记录": "No execution records",
    "点击「立即执行」触发一次手动运行": "Click 'Run Now' to trigger a manual run",
    "成功": "Success",
    "失败": "Failed",
    "每": "Every",
    "生成方式": "Generation Mode",
    "AI 自动生成": "AI Auto-generate",
    "由LLM生成完整课程内容和测验": "Generate complete course content and quizzes by LLM",
    "手动创建": "Create Manually",
    "创建课程框架，手动填充内容": "Create course framework, fill content manually",
    "章节数量": "Number of Chapters",
    "章": "Chapters",
    "难度": "Difficulty",
    "入门": "Beginner",
    "中级": "Intermediate",
    "高级": "Advanced",
    "模型配置": "Model Config",
    "使用全局默认（Gland配置）": "Use global default (Gland config)",
    "自定义模型": "Custom Model",
    "选择Provider": "Select Provider",
    "选择模型": "Select Model",
    "请选择provider和model": "Please select provider and model",
    "使用Gland全局配置": "Use Gland global config",
    "当前执行": "Current Execution",
    "历史记录": "History",
    "执行完成": "Completed",
    "执行失败": "Failed",
    "已取消": "Cancelled",
    "错误信息": "Error Message",
    "执行步骤": "Execution Steps",
    "输入变量": "Input Variables",
    "已选中": "Selected",
    "开始": "Start",
    "新建工作流": "New Workflow",
    "选择或创建工作流": "Select or create a workflow",
    "从左侧列表选择，或点击工具栏「新建」": "Select from left panel, or click 'New' in toolbar",
    "加载中...": "Loading...",
    "Smart Calculator": "Smart Calculator",
    "数学表达式求解 · 单位转换 · 计算历史": "Math expression solver · Unit conversion · Calculation history",
}

# Process each file and collect replacements
def process_file(filepath, section, has_i18n):
    """Process a single file, return list of (old, new) replacements"""
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    replacements = []
    
    # Find all Chinese strings in the file
    # Pattern: quoted strings containing Chinese characters
    # We need to handle: JSX text, string literals, template literals, title attributes, placeholder attributes
    
    # Strategy: Find each Chinese string occurrence and replace it with t() call
    # We need to be careful about context (JSX vs string vs template literal)
    
    lines = content.split('\n')
    new_lines = []
    
    for i, line in enumerate(lines):
        new_line = line
        # Find Chinese strings in this line
        # Match Chinese characters in various contexts
        
        # 1. Replace Chinese text in JSX (between > and <)
        # 2. Replace Chinese in placeholder="..." 
        # 3. Replace Chinese in title="..."
        # 4. Replace Chinese in string literals
        
        # Find all occurrences of Chinese text
        # Regex for Chinese characters
        cn_pattern = re.compile(r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef][\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u0020\u0028\u0029\u002c\u002e\u002f\u003a\u003b\u0021\u003f\u0027\u0022\u2014\u2018\u2019\u201c\u201d\u00b7\u00a0]*')
        
        # Find Chinese strings in the line
        matches = list(cn_pattern.finditer(line))
        if not matches:
            new_lines.append(new_line)
            continue
        
        # Process matches in reverse order to maintain positions
        for match in reversed(matches):
            chinese_text = match.group()
            start = match.start()
            end = match.end()
            
            # Determine context
            prefix = line[:start]
            
            # Skip if inside a comment
            if '//' in prefix and '<' not in prefix.split('//')[-1]:
                continue
            
            # Get the translation key
            key = gen_key(section, chinese_text)
            en_val = TRANSLATIONS.get(chinese_text, chinese_text)
            add_translation(section, key, chinese_text, en_val)
            
            # Determine how to wrap the t() call
            # Check what context the Chinese text is in
            
            # Case 1: In a JSX attribute like placeholder="中文" or title="中文"
            attr_match = re.search(r'(placeholder|title|alt|aria-label|label)=["\']$', prefix)
            if attr_match:
                attr_name = attr_match.group(1)
                # Replace the attribute value
                # Find the closing quote
                before = line[:start]
                after = line[end:]
                # Check if it ends with a quote
                if after and after[0] in ('"', "'"):
                    quote = after[0]
                    new_line = new_line[:start] + '{' + f"t('{section}.{key}')" + '}' + new_line[end+1:]
                continue
            
            # Case 2: JSX text content (between > and <)
            # Check if preceded by > (possibly with whitespace)
            trimmed_prefix = prefix.rstrip()
            if trimmed_prefix.endswith('>') or (trimmed_prefix.endswith('}') and 'className' not in prefix[-50:]):
                # JSX text content
                # Handle mixed content like "个任务 · {agentActive} 运行中"
                # We need to find the full JSX text block
                
                # Simple case: just the Chinese text
                before_text = line[:start].rstrip()
                after_text = line[end:].lstrip()
                
                if after_text.startswith('<'):
                    # Pure Chinese text in JSX
                    new_line = new_line[:start] + '{' + f"t('{section}.{key}')" + '}' + new_line[end:]
                else:
                    # Mixed content - wrap the whole text portion
                    # Find the boundaries of the text content
                    # This is complex, so let's handle specific patterns
                    
                    # Pattern: "X 个任务 · Y 运行中"
                    if '个任务' in chinese_text or '运行中' in chinese_text:
                        new_line = new_line[:start] + '{' + f"t('{section}.{key}')" + '}' + new_line[end:]
                    else:
                        new_line = new_line[:start] + '{' + f"t('{section}.{key}')" + '}' + new_line[end:]
                continue
            
            # Case 3: Inside a string literal (single or double quotes)
            # Check if surrounded by quotes
            if start > 0 and line[start-1] in ('"', "'") and end < len(line) and line[end] in ('"', "'"):
                # String literal - need to break out of it
                quote = line[start-1]
                before = line[:start-1]
                after = line[end+1:]
                new_line = before + '{' + f"t('{section}.{key}')" + '}' + after
                continue
            
            # Case 4: In template literal
            if start > 0 and line[start-1] == '`':
                # Template literal
                new_line = new_line[:start] + '${' + f"t('{section}.{key}')" + '}' + new_line[end:]
                continue
            
            # Case 5: Standalone text in JSX (like ">中文<")
            # Default: wrap in t()
            new_line = new_line[:start] + '{' + f"t('{section}.{key}')" + '}' + new_line[end:]
        
        new_lines.append(new_line)
    
    content = '\n'.join(new_lines)
    
    # Add useTranslation import if not present and not a page.tsx
    if not has_i18n and 'useTranslation' not in content and 'page.tsx' not in filepath:
        # Add import
        content = content.replace(
            '"use client";\n',
            '"use client";\nimport { useTranslation } from "react-i18next";\n',
            1
        )
        if 'useTranslation' not in content:
            content = content.replace(
                "'use client';\n",
                "'use client';\nimport { useTranslation } from 'react-i18next';\n",
                1
            )
        # Add const { t } = useTranslation(); at the start of the component
        # Find the component function and add it
        func_patterns = [
            r'(export function \w+\(\) \{)',
            r'(export function \w+\([^)]*\) \{)',
        ]
        for pat in func_patterns:
            m = re.search(pat, content)
            if m:
                insert_pos = m.end()
                content = content[:insert_pos] + '\n  const { t } = useTranslation();' + content[insert_pos:]
                break
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        return True
    return False

# This approach is too complex for automated replacement. Let me use a more targeted approach.
# Instead, I'll process each file manually with specific replacements.

print("Script loaded. Using targeted replacement approach.")
print("Number of translation entries in zh:", sum(len(v) for v in zh.values()))
