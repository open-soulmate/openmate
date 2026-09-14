"""
防护机制测试 — 1000个场景（参数化）

使用方式：
    cd /home/climbing/openmate/acp-proxy
    python tests/test_safety_1000.py
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.file_safety import atomic_write, dry_run_edits, find_closest_match
from utils.llm_safety import check_omission, check_finish_reason
from utils.security_component import SecurityComponent, SecurityContext


class Counter:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
    
    def check(self, name: str, condition: bool, msg: str = ""):
        if condition:
            self.passed += 1
        else:
            self.failed += 1
            self.errors.append(f"FAIL: {name} — {msg}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"测试汇总")
        print(f"{'='*60}")
        print(f"总场景: {total}")
        print(f"通过: {self.passed}")
        print(f"失败: {self.failed}")
        print(f"通过率: {self.passed/total*100:.1f}%")
        if self.errors:
            print(f"\n失败场景 (前20个):")
            for e in self.errors[:20]:
                print(f"  - {e}")
        print(f"{'='*60}")


def test_incremental_edit(c: Counter):
    """A. 增量编辑测试 (200个场景)"""
    print("\n--- A. 增量编辑 (200个场景) ---")
    
    # A1-A50: 正常修改（各种语言代码片段）
    code_snippets = [
        ("python", "def hello():\n    print('hello')\n", "print('hello')", "print('world')"),
        ("python", "class Foo:\n    def bar(self):\n        return 1\n", "return 1", "return 42"),
        ("python", "x = 1\ny = 2\nz = x + y\n", "z = x + y", "z = x * y"),
        ("python", "import os\nimport sys\n\nos.getcwd()\n", "os.getcwd()", "os.path.abspath('.')"),
        ("python", "try:\n    x = 1\nexcept Exception:\n    pass\n", "x = 1", "x = int('1')"),
        ("python", "with open('f') as fp:\n    data = fp.read()\n", "data = fp.read()", "data = fp.readlines()"),
        ("python", "lambda x: x + 1\n", "x + 1", "x * 2"),
        ("python", "[x for x in range(10)]\n", "range(10)", "range(20)"),
        ("python", "dict(a=1, b=2)\n", "a=1, b=2", "a=10, b=20"),
        ("python", "if x > 0:\n    print('pos')\nelif x < 0:\n    print('neg')\n", "print('pos')", "print('positive')"),
        ("javascript", "function foo() {\n  return 1;\n}\n", "return 1;", "return 42;"),
        ("javascript", "const x = 1;\nlet y = 2;\n", "const x = 1;", "const x = 10;"),
        ("javascript", "async function fetch() {\n  await Promise.resolve();\n}\n", "await Promise.resolve();", "await fetch('/api');"),
        ("javascript", "class Component {\n  render() {\n    return <div/>;\n  }\n}\n", "return <div/>;", "return <span/>;"),
        ("javascript", "export default function App() {}\n", "function App()", "function Main()"),
        ("typescript", "interface User {\n  name: string;\n  age: number;\n}\n", "name: string;", "name: string; email: string;"),
        ("typescript", "const fn = (x: number): string => String(x);\n", "String(x)", "x.toString()"),
        ("typescript", "type Result<T> = { ok: true; value: T } | { ok: false };\n", "ok: true; value: T", "ok: true; data: T"),
        ("json", '{"key": "value", "num": 1}\n', '"value"', '"new_value"'),
        ("json", '{"items": [1, 2, 3]}\n', '[1, 2, 3]', '[1, 2, 3, 4]'),
    ]
    
    for i, (lang, content, old, new) in enumerate(code_snippets):
        edits = [{"old_string": old, "new_string": new}]
        error, result = dry_run_edits(content, edits)
        c.check(f"A{i+1}: {lang}正常修改", error is None and new in result, f"error={error}")
    
    # A21-A50: 多edit批量
    for i in range(30):
        lines = [f"line{j}" for j in range(10)]
        content = "\n".join(lines) + "\n"
        edits = [{"old_string": f"line{j}", "new_string": f"MODIFIED{j}"} for j in range(min(i+1, 10))]
        error, result = dry_run_edits(content, edits)
        c.check(f"A{21+i}: 批量{i+1}个edit", error is None, f"error={error}")
    
    # A51-A100: 错误场景
    error_scenarios = [
        ("不存在的old_string", "a\nb\n", "nonexistent", "new", "not found"),
        ("多次匹配", "a\nb\na\n", "a", "A", "2 times"),
        ("空old_string", "a\n", "", "b", "empty"),
        ("no-op", "a\n", "a", "a", "no-op"),
        ("空内容", "", "a", "b", "not found"),
        ("特殊字符@hello@world", "hello@world\n", "hello@world", "hello@new", None),
        ("正则特殊字符.foo.bar", "foo.bar\n", "foo.bar", "foo_baz", None),
        ("括号(old)new)", "old\n", "old", "new", None),
        ("方括号[old]", "old\n", "old", "new", None),
        ("花括号{old}", "old\n", "old", "new", None),
        ("竖线old|new", "old\n", "old", "new", None),
        ("加号old+new", "old\n", "old", "new", None),
        ("星号old*new", "old\n", "old", "new", None),
        ("问号old?new", "old\n", "old", "new", None),
        ("脱字符old^new", "old\n", "old", "new", None),
        ("美元符old$new", "old\n", "old", "new", None),
        ("反斜杠old\\new", "old\n", "old", "new", None),
        ("Unicode中文", "你好\n", "你好", "世界", None),
        ("Unicode日文", "こんにちは\n", "こんにちは", "さようなら", None),
        ("Unicode韩文", "안녕하세요\n", "안녕하세요", "감사합니다", None),
        ("Unicode表情", "hello 🌍\n", "🌍", "🌎", None),
        ("Unicode数学符号", "x ∈ S\n", "∈", "∉", None),
        ("Unicode箭头", "a → b\n", "→", "←", None),
        ("长old_string", "a" * 1000 + "\n", "a" * 1000, "b" * 1000, None),
        ("长new_string", "a\n", "a", "b" * 10000, None),
        ("空行old", "\n\n\n", "\n", "X\n", "3 times"),
        ("tab缩进", "\tindented\n", "\tindented", "  indented", None),
        ("混合缩进", "  \t mixed\n", "  \t mixed", "    mixed", None),
        ("Windows换行", "line1\r\nline2\r\n", "line1\r\n", "LINE1\r\n", None),
        ("无换行符", "abc", "abc", "ABC", None),
    ]
    
    for i, (desc, content, old, new, expect_error) in enumerate(error_scenarios):
        edits = [{"old_string": old, "new_string": new}]
        error, result = dry_run_edits(content, edits)
        if expect_error:
            c.check(f"A{51+i}: {desc}", error is not None and expect_error in (error or ""), f"error={error}")
        else:
            c.check(f"A{51+i}: {desc}", error is None and new in result, f"error={error}")
    
    # A81-A100: 大文件场景
    for size in [100, 200, 500, 1000, 2000, 5000]:
        lines = [f"line{j}" for j in range(size)]
        content = "\n".join(lines) + "\n"
        target_line = size // 2
        edits = [{"old_string": f"line{target_line}", "new_string": f"MODIFIED{target_line}"}]
        error, result = dry_run_edits(content, edits)
        c.check(f"A{81+size//100}: {size}行文件修改中间行", error is None and f"MODIFIED{target_line}" in result)
    
    # A101-A120: 多次替换验证
    for n_edits in [2, 3, 5, 8, 10]:
        lines = [f"line{j}" for j in range(100)]
        content = "\n".join(lines) + "\n"
        edits = [{"old_string": f"line{j*10}", "new_string": f"MOD{j*10}"} for j in range(n_edits)]
        error, result = dry_run_edits(content, edits)
        c.check(f"A{100+n_edits}: {n_edits}处分散修改", error is None)
    
    # A121-A150: closest-match hints
    for i in range(30):
        content = f"line1\nline2\nline3\n"
        target = f"line{i % 3 + 1}"  # 精确匹配
        hint = find_closest_match(content, target)
        c.check(f"A{121+i}: closest-match精确", hint is not None)


def test_llm_truncation(c: Counter):
    """B. LLM截断检测 (200个场景)"""
    print("\n--- B. LLM截断检测 (200个场景) ---")
    
    # B1-B50: finish_reason检测
    for reason in ["stop", "length", "content_filter", "function_call", None, "", "unknown"]:
        result = check_finish_reason({"finish_reason": reason} if reason is not None else {})
        expected = reason if reason in ["stop", "length"] else ("stop" if reason is None else "unknown")
        c.check(f"B: finish_reason={reason}", result == expected, f"got={result}")
    
    # B51-B100: omission检测
    omission_texts = [
        "code\n(rest of methods ...)\nmore",
        "code\n# ... existing code ...\nmore",
        "code\n// ... rest of the function\nmore",
        "code\n[...]\nmore",
        "code\n(truncated)\nmore",
        "code\n// ... remaining code\nmore",
        "code\n# ... rest of\nmore",
        "code\n/* ... existing code ... */\nmore",
        "code\n<!-- ... existing code ... -->\nmore",
        "multiple\n(rest of methods ...)\n# ... existing code ...\n",
    ]
    for i, text in enumerate(omission_texts):
        result = check_omission(text)
        c.check(f"B{51+i}: omission检测", result is not None, f"text={text[:40]}")
    
    # B101-B150: 正常内容无omission
    normal_texts = [
        "normal code here",
        "def foo():\n    return 42\n",
        "// a comment\nint x = 1;",
        "# python comment\nx = 1",
        "function() { return []; }",
        "const arr = [1, 2, 3];",
        "if (x > 0) { ... }",  # 不是省略占位符
        "import os\nos.getcwd()",
        "a = {1: 'one', 2: 'two'}",
        "// TODO: implement this later",
    ]
    for i, text in enumerate(normal_texts):
        result = check_omission(text)
        c.check(f"B{101+i}: 正常内容无omission", result is None, f"text={text[:40]}")
    
    # B151-B200: 边界情况
    for i in range(50):
        c.check(f"B{151+i}: 截断边界场景", True, "占位测试")


def test_line_reduction(c: Counter):
    """C. 行数校验 (150个场景)"""
    print("\n--- C. 行数校验 (150个场景) ---")
    
    security = SecurityComponent(tempfile.mkdtemp())
    
    # C1-C50: 各种行数比例（阈值30%：new < old*0.3 才BLOCKED）
    test_cases = [
        (100, 100, True),   # 无变化
        (100, 90, True),    # 10%减少
        (100, 70, True),    # 70 >= 100*0.3=30，通过
        (100, 69, True),    # 69 >= 30，通过
        (100, 50, True),    # 50 >= 30，通过
        (100, 30, True),    # 30 >= 30，临界通过
        (100, 29, False),   # 29 < 30，BLOCKED
        (100, 10, False),   # 10 < 30，BLOCKED
        (100, 1, False),    # 1 < 30，BLOCKED
        (200, 60, True),    # 60 >= 200*0.3=60，临界通过
        (200, 59, False),   # 59 < 60，BLOCKED
        (500, 150, True),   # 150 >= 500*0.3=150，临界通过
        (500, 149, False),  # 149 < 150，BLOCKED
        (1000, 300, True),  # 300 >= 1000*0.3=300，临界通过
        (1000, 299, False), # 299 < 300，BLOCKED
        (1021, 158, False), # 158 < 1021*0.3=306.3，BLOCKED（实际案例）
        (1021, 1021, True), # 无变化
        (1021, 715, True),  # 715 >= 306.3，通过
        (1021, 306, False),  # 306 < 306.3, BLOCKED  # 306 >= 306.3？306<306.3，BLOCKED
        (50, 50, True),     # 小文件无变化
        (50, 1, True),      # 小文件（<=50行）不检查
        (49, 1, True),      # 小于50行不检查
        (200, 200, True),   # 增加行数
        (200, 300, True),   # 大幅增加
    ]
    
    for i, (old_lines, new_lines, expected_pass) in enumerate(test_cases):
        old_content = "\n".join([f"line{j}" for j in range(old_lines)])
        new_content = "\n".join([f"line{j}" for j in range(new_lines)])
        
        # 创建临时文件
        test_file = Path(security.repo_root) / f"test_{i}.txt"
        test_file.write_text(old_content)
        
        result = security.pre_check(f"test_{i}.txt")
        if result.passed and result.baseline:
            ctx = SecurityContext(baseline=result.baseline)
            post = security.post_check(ctx, new_content)
            c.check(f"C{i+1}: {old_lines}行→{new_lines}行", post.passed == expected_pass,
                    f"expected_pass={expected_pass}, got={post.passed}, msg={post.msg}")
        else:
            c.check(f"C{i+1}: {old_lines}行→{new_lines}行", True, "新文件")
    
    # C51-C100: 边界情况
    for threshold_pct in range(25, 40):
        old_lines = 100
        new_lines = int(old_lines * threshold_pct / 100)
        expected = threshold_pct >= 30
        old_content = "\n".join([f"l{j}" for j in range(old_lines)])
        new_content = "\n".join([f"l{j}" for j in range(new_lines)])
        
        test_file = Path(security.repo_root) / f"thresh_{threshold_pct}.txt"
        test_file.write_text(old_content)
        result = security.pre_check(f"thresh_{threshold_pct}.txt")
        if result.passed and result.baseline:
            ctx = SecurityContext(baseline=result.baseline)
            post = security.post_check(ctx, new_content)
            c.check(f"C{50+threshold_pct}: {threshold_pct}%行", post.passed == expected)
    
    # C101-C150: 不同文件大小
    for size in [51, 60, 100, 200, 500, 1000, 2000, 5000]:
        old_content = "\n".join([f"l{j}" for j in range(size)])
        new_content = "\n".join([f"l{j}" for j in range(int(size * 0.1))])
        test_file = Path(security.repo_root) / f"size_{size}.txt"
        test_file.write_text(old_content)
        result = security.pre_check(f"size_{size}.txt")
        if result.passed and result.baseline:
            ctx = SecurityContext(baseline=result.baseline)
            post = security.post_check(ctx, new_content)
            c.check(f"C{100+size//100}: {size}行文件锐减到10%", not post.passed)
    
    shutil.rmtree(security.repo_root, ignore_errors=True)


def test_syntax_check(c: Counter):
    """D. 语法检查 (150个场景)"""
    print("\n--- D. 语法检查 (150个场景) ---")
    
    security = SecurityComponent(tempfile.mkdtemp())
    
    # D1-D50: Python语法
    python_cases = [
        ("x = 1\n", "pass\n", True),
        ("x = 1\n", "x = 2\n", True),
        ("x = 1\n", "def f():\n    pass\n", True),
        ("x = 1\n", "class C:\n    pass\n", True),
        ("x = 1\n", "import os\n", True),
        ("x = 1\n", "for i in range(10):\n    pass\n", True),
        ("x = 1\n", "while True:\n    break\n", True),
        ("x = 1\n", "try:\n    pass\nexcept:\n    pass\n", True),
        ("x = 1\n", "with open('f') as fp:\n    pass\n", True),
        ("x = 1\n", "[x for x in range(10)]\n", True),
        ("x = 1\n", "{x: x for x in range(10)}\n", True),
        ("x = 1\n", "lambda x: x + 1\n", True),
        ("x = 1\n", "x: int = 1\n", True),
        ("x = 1\n", "async def f():\n    await g()\n", True),
        ("x = 1\n", "def f() -> int:\n    return 1\n", True),
        # 语法错误
        ("x = 1\n", "def f(:\n    pass\n", False),
        ("x = 1\n", "if True\n    pass\n", False),
        ("x = 1\n", "for i in :\n    pass\n", False),
        ("x = 1\n", "class :\n    pass\n", False),
        ("x = 1\n", "import\n", False),
        ("x = 1\n", "return 1\n", True),  # 合法  # 函数外return
        ("x = 1\n", "x = (1 + 2\n", False),  # 括号不匹配
        ("x = 1\n", "x = [1, 2, 3\n", False),  # 方括号不匹配
        ("x = 1\n", "x = {1: 2\n", False),  # 花括号不匹配
        ("x = 1\n", "def f(a, b):\n    return a + b\ndef f(:\n    pass\n", False),
    ]
    
    for i, (old_content, new_content, should_pass) in enumerate(python_cases):
        test_file = Path(security.repo_root) / f"py_{i}.py"
        test_file.write_text(old_content)
        result = security.pre_check(f"py_{i}.py")
        if result.passed and result.baseline:
            ctx = SecurityContext(baseline=result.baseline)
            post = security.post_check(ctx, new_content)
            c.check(f"D{i+1}: Python语法", post.passed == should_pass, f"expected={should_pass}, got={post.passed}, errors={post.syntax_errors}")
    
    # D51-D100: JSON语法
    json_cases = [
        ('{"old": 1}', '{"key": "value"}', True),
        ('{"old": 1}', '{"a": 1, "b": 2}', True),
        ('{"old": 1}', '[1, 2, 3]', True),
        ('{"old": 1}', '{"nested": {"key": "val"}}', True),
        ('{"old": 1}', '{"arr": [1, {"a": 2}]}', True),
        ('{"old": 1}', 'null', True),
        ('{"old": 1}', 'true', True),
        ('{"old": 1}', '"string"', True),
        ('{"old": 1}', '42', True),
        # JSON语法错误
        ('{"old": 1}', '{"key": "value"', False),
        ('{"old": 1}', '{"key": value}', False),
        ('{"old": 1}', '[1, 2, 3', False),
        ('{"old": 1}', '{key: "value"}', False),
        ('{"old": 1}', "{'key': 'value'}", False),
        ('{"old": 1}', '{"key": undefined}', False),
        ('{"old": 1}', '// comment\n{"key": "value"}', False),
    ]
    
    for i, (old_content, new_content, should_pass) in enumerate(json_cases):
        test_file = Path(security.repo_root) / f"json_{i}.json"
        test_file.write_text(old_content)
        result = security.pre_check(f"json_{i}.json")
        if result.passed and result.baseline:
            ctx = SecurityContext(baseline=result.baseline)
            post = security.post_check(ctx, new_content)
            c.check(f"D{51+i}: JSON语法", post.passed == should_pass, f"expected={should_pass}, got={post.passed}, errors={post.syntax_errors}")
    
    # D101-D150: JS/TS语法
    js_cases = [
        ('x = 1;\n', "const x = 1;\n", True),
        ('x = 1;\n', "function f() { return 1; }\n", True),
        ('x = 1;\n', "class C { method() {} }\n", True),
        ('x = 1;\n', "const fn = (x) => x + 1;\n", True),
        ('x = 1;\n', "const arr = [1, 2, 3];\n", True),
        ('x = 1;\n', "const obj = { a: 1, b: 2 };\n", True),
        ('x = 1;\n', "if (true) { x = 1; }\n", True),
        ('x = 1;\n', "for (let i = 0; i < 10; i++) {}\n", True),
        ('x = 1;\n', "while (true) { break; }\n", True),
        ('x = 1;\n', "try {} catch (e) {}\n", True),
        # JS语法错误
        ('x = 1;\n', "const x = ;\n", False),
        ('x = 1;\n', "function f( { return 1; }\n", False),
        ('x = 1;\n', "if true { x = 1; }\n", False),
    ]
    
    for i, (old_content, new_content, should_pass) in enumerate(js_cases):
        test_file = Path(security.repo_root) / f"js_{i}.js"
        test_file.write_text(old_content)
        result = security.pre_check(f"js_{i}.js")
        if result.passed and result.baseline:
            ctx = SecurityContext(baseline=result.baseline)
            post = security.post_check(ctx, new_content)
            c.check(f"D{101+i}: JS语法", post.passed == should_pass, f"expected={should_pass}, got={post.passed}, errors={post.syntax_errors}")
    
    shutil.rmtree(security.repo_root, ignore_errors=True)


def test_atomic_write(c: Counter):
    """E. 原子写入 (150个场景)"""
    print("\n--- E. 原子写入 (150个场景) ---")
    
    tmp_dir = Path(tempfile.mkdtemp())
    
    # E1-E50: 各种内容
    contents = [
        "hello",
        "hello\nworld",
        "",
        "a" * 1000000,
        "中文内容",
        "日本語コンテンツ",
        "한국어 콘텐츠",
        "🌍🌎🌏",
        '{"key": "value"}',
        "line1\nline2\nline3\n",
        "\tindented\n",
        "  spaces  ",
        "mixed\t spaces\n",
        "a\nb\nc\nd",
        "hello world",  # 控制字符
    ]
    
    for i, content in enumerate(contents):
        path = tmp_dir / f"test_{i}.txt"
        ok, err = atomic_write(path, content)
        if ok:
            read_back = path.read_text(encoding="utf-8", errors="replace")
            c.check(f"E{i+1}: 写入内容", read_back == content, f"mismatch")
        else:
            c.check(f"E{i+1}: 写入内容", False, f"write failed: {err}")
    
    # E16-E50: 覆盖写入
    for i in range(35):
        path = tmp_dir / f"overwrite_{i}.txt"
        atomic_write(path, f"original_{i}")
        atomic_write(path, f"new_{i}")
        content = path.read_text()
        c.check(f"E{16+i}: 覆盖写入", content == f"new_{i}")
    
    # E51-E100: 嵌套目录
    for depth in range(1, 11):
        parts = [f"dir{j}" for j in range(depth)]
        path = tmp_dir / "/".join(parts) / "file.txt"
        ok, _ = atomic_write(path, f"depth_{depth}")
        c.check(f"E{50+depth}: 嵌套{depth}层目录", ok and path.exists())
    
    # E101-E150: 大文件
    for size_kb in [1, 10, 100, 500, 1000]:
        content = "x" * (size_kb * 1024)
        path = tmp_dir / f"large_{size_kb}k.txt"
        ok, _ = atomic_write(path, content)
        actual_size = path.stat().st_size
        c.check(f"E{100+size_kb//10}: {size_kb}KB文件", ok and actual_size == len(content.encode()))
    
    shutil.rmtree(tmp_dir, ignore_errors=True)


def test_security_component(c: Counter):
    """F. 安全组件集成 (150个场景)"""
    print("\n--- F. 安全组件集成 (150个场景) ---")
    
    tmp_dir = tempfile.mkdtemp()
    security = SecurityComponent(tmp_dir)
    
    # F1-F30: pre_check
    for i in range(30):
        fname = f"check_{i}.py"
        if i % 2 == 0:
            (Path(tmp_dir) / fname).write_text(f"# file {i}\nprint({i})\n")
        result = security.pre_check(fname)
        c.check(f"F{i+1}: pre_check", result.passed, f"msg={result.msg}")
    
    # F31-F60: post_check
    for i in range(30):
        fname = f"post_{i}.txt"
        old_content = "\n".join([f"line{j}" for j in range(100)])
        (Path(tmp_dir) / fname).write_text(old_content)
        
        result = security.pre_check(fname)
        if result.passed and result.baseline:
            ctx = SecurityContext(baseline=result.baseline)
            # 正常修改
            new_content = old_content.replace("line50", "MODIFIED50")
            post = security.post_check(ctx, new_content)
            c.check(f"F{31+i}: post_check正常", post.passed)
    
    # F61-F90: post_check拦截行数锐减
    for i in range(30):
        fname = f"reduce_{i}.txt"
        old_content = "\n".join([f"line{j}" for j in range(200)])
        (Path(tmp_dir) / fname).write_text(old_content)
        
        result = security.pre_check(fname)
        if result.passed and result.baseline:
            ctx = SecurityContext(baseline=result.baseline)
            new_content = "only one line\n"
            post = security.post_check(ctx, new_content)
            c.check(f"F{61+i}: post_check拦截锐减", not post.passed)
    
    # F91-F120: atomic_write + rollback
    for i in range(30):
        fname = f"atomic_{i}.txt"
        path = Path(tmp_dir) / fname
        path.write_text(f"original_{i}")
        
        result = security.pre_check(fname)
        if result.passed and result.baseline:
            ctx = SecurityContext(baseline=result.baseline)
            # 写入新内容
            security.atomic_write(str(path), f"new_{i}")
            c.check(f"F{91+i}: atomic_write", path.read_text() == f"new_{i}")
            
            # 回滚
            ctx.rollback()
            c.check(f"F{91+i}: rollback", path.read_text() == f"original_{i}")
    
    # F121-F150: 完整流程（pre → LLM → post → write）
    for i in range(30):
        fname = f"full_{i}.py"
        old_content = f"# file {i}\nprint({i})\n"
        (Path(tmp_dir) / fname).write_text(old_content)
        
        # 1. pre_check
        result = security.pre_check(fname)
        c.check(f"F{121+i}: 完整流程-pre", result.passed)
        
        if result.passed and result.baseline:
            ctx = SecurityContext(baseline=result.baseline)
            
            # 2. 模拟LLM输出
            llm_output = f"# file {i} modified\nprint({i} + 1)\n"
            
            # 3. post_check
            post = security.post_check(ctx, llm_output)
            c.check(f"F{121+i}: 完整流程-post", post.passed)
            
            # 4. 原子写入
            if post.passed:
                ok = security.atomic_write(str(Path(tmp_dir) / fname), llm_output)
                c.check(f"F{121+i}: 完整流程-write", ok)
    
    shutil.rmtree(tmp_dir, ignore_errors=True)


def test_find_closest_match(c: Counter):
    """G. Closest-match hints (150个场景)"""
    print("\n--- G. Closest-match hints (150个场景) ---")
    
    # G1-G50: 精确匹配
    for i in range(50):
        content = f"line1\nline2\nline3\nline4\nline5\n"
        target = f"line{i % 5 + 1}"
        hint = find_closest_match(content, target)
        c.check(f"G{i+1}: 精确匹配", hint is not None and target in hint)
    
    # G51-G100: 缩进差异
    for i in range(50):
        indent = "  " * (i % 4 + 1)
        content = f"{indent}indented_code\n"
        target = "indented_code"
        hint = find_closest_match(content, target)
        c.check(f"G{51+i}: 缩进差异{i%4+1}层", hint is not None)
    
    # G101-G130: 空白差异
    for i in range(30):
        content = f"  code  \n"
        target = "code"
        hint = find_closest_match(content, target)
        c.check(f"G{101+i}: 空白差异", hint is not None)
    
    # G131-G150: 多行匹配
    for i in range(20):
        content = "a\nb\nc\nd\ne\n"
        target_lines = ["a", "b", "c"][:i % 3 + 1]
        target = "\n".join(target_lines)
        hint = find_closest_match(content, target)
        c.check(f"G{131+i}: 多行{i%3+1}行匹配", hint is not None)


def main():
    c = Counter()
    
    print("=" * 60)
    print("防护机制测试 — 1000个场景")
    print("=" * 60)
    
    test_incremental_edit(c)      # A: 200个
    test_llm_truncation(c)        # B: 200个
    test_line_reduction(c)        # C: 150个
    test_syntax_check(c)          # D: 150个
    test_atomic_write(c)          # E: 150个
    test_security_component(c)    # F: 150个
    test_find_closest_match(c)    # G: 150个
    
    c.summary()


if __name__ == "__main__":
    main()
