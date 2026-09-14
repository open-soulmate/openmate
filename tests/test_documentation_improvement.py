import pytest
from unittest.mock import Mock, patch, MagicMock
from documentation_improvement import (
    DocumentationImprovementGenerator,
    DocumentationValidator,
    DocumentationImprovementPipeline
)
from documentation_improvement.models import (
    SpellingSuggestion,
    LinkSuggestion,
    FormattingSuggestion,
    ValidationResult
)

# 测试数据
VALID_DOC_CONTENT = """
# 正确的文档

这是一个没有任何问题的文档。

## 正确的链接
- [有效的链接](https://example.com)
- [另一个有效的链接](https://example.org)

## 正确的格式
**粗体文本**和*斜体文本*。

## 正确的拼写
所有单词都拼写正确。
"""

INVALID_DOC_CONTENT = """
# 有问题的文档

这个文档有一些问题。

## 拼写错误
- 计算机 - 拼写错误，应该是"computer"
- 程序设计 - 拼写错误，应该是"programming"

## 坏链接
- [失效的链接](https://invalid.example.com)
- [错误的链接](htts://malformed.url)

## 格式问题
**缺失闭合标记
没有正确闭合的格式标签

## 格式不一致
- 标题使用#，但子标题没有一致使用
- 列表项格式不统一
"""

@pytest.fixture
def spelling_doc():
    """只包含拼写错误的文档"""
    return "拼写错误测试：计算机"

@pytest.fixture
def bad_links_doc():
    """只包含坏链接的文档"""
    return "[失效链接](https://invalid.example.com)"

@pytest.fixture
def formatting_issues_doc():
    """只包含格式问题的文档"""
    return "**未闭合的粗体"

@pytest.fixture
def valid_doc():
    """完全正确的文档"""
    return VALID_DOC_CONTENT

@pytest.fixture
def invalid_doc():
    """包含各种问题的文档"""
    return INVALID_DOC_CONTENT

@pytest.fixture
def generator():
    """创建文档改进生成器实例"""
    return DocumentationImprovementGenerator()

@pytest.fixture
def validator():
    """创建文档验证器实例"""
    return DocumentationValidator()

@pytest.fixture
def pipeline():
    """创建端到端管道实例"""
    return DocumentationImprovementPipeline()

class TestImprovementGenerator:
    """测试文档改进生成器"""

    def test_spelling_suggestions(self, generator, spelling_doc):
        """测试生成器能识别拼写错误并提供建议"""
        suggestions = generator.generate_improvements(spelling_doc)
        
        # 验证至少有一个拼写建议
        spelling_suggestions = [s for s in suggestions if isinstance(s, SpellingSuggestion)]
        assert len(spelling_suggestions) > 0
        
        # 验证建议内容
        for suggestion in spelling_suggestions:
            assert suggestion.original_word in spelling_doc
            assert suggestion.suggested_correction != suggestion.original_word

    def test_link_suggestions(self, generator, bad_links_doc):
        """测试生成器能识别坏链接并提供建议"""
        suggestions = generator.generate_improvements(bad_links_doc)
        
        # 验证至少有一个链接建议
        link_suggestions = [s for s in suggestions if isinstance(s, LinkSuggestion)]
        assert len(link_suggestions) > 0
        
        # 验证建议内容
        for suggestion in link_suggestions:
            assert "[" in suggestion.link_text or "]" in suggestion.link_text
            assert "http" in suggestion.link_url

    def test_formatting_suggestions(self, generator, formatting_issues_doc):
        """测试生成器能识别格式问题并提供建议"""
        suggestions = generator.generate_improvements(formatting_issues_doc)
        
        # 验证至少有一个格式建议
        formatting_suggestions = [s for s in suggestions if isinstance(s, FormattingSuggestion)]
        assert len(formatting_suggestions) > 0

    def test_valid_doc_no_suggestions(self, generator, valid_doc):
        """测试对正确文档不生成任何建议"""
        suggestions = generator.generate_improvements(valid_doc)
        assert len(suggestions) == 0

    def test_mixed_issues_suggestions(self, generator, invalid_doc):
        """测试对包含多种问题的文档生成所有类型的建议"""
        suggestions = generator.generate_improvements(invalid_doc)
        
        # 验证包含所有类型的建议
        suggestion_types = {type(s) for s in suggestions}
        assert SpellingSuggestion in suggestion_types
        assert LinkSuggestion in suggestion_types
        assert FormattingSuggestion in suggestion_types

    def test_suggestion_details(self, generator, invalid_doc):
        """测试建议包含正确的详细信息"""
        suggestions = generator.generate_improvements(invalid_doc)
        
        for suggestion in suggestions:
            # 验证所有建议都有行号或位置信息
            assert hasattr(suggestion, 'line_number') or hasattr(suggestion, 'position')
            
            # 验证所有建议都有描述
            assert hasattr(suggestion, 'description')
            assert len(suggestion.description) > 0

class TestDocumentationValidator:
    """测试文档验证器"""
