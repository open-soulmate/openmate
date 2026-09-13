# acp-proxy/config.py

# Exclusion patterns for evolution
EXCLUDE_PATTERNS = [
    # Existing patterns (assumed)
    '*.pyc',
    '__pycache__',
    '.git',
    '.vscode',
    # Added patterns for docs directory
    'docs/*.md',
    'docs/*.rst',
    'docs/*.txt',
    'docs/*.pdf',
    'docs/*.doc',
    'docs/*.docx',
    'docs/*.html',
    'docs/*.htm',
]

# Document-specific extensions requiring special handling
DOCUMENT_EXTENSIONS = [
    '.md',      # Markdown
    '.rst',     # reStructuredText
    '.txt',     # Text
    '.pdf',     # PDF
    '.doc',     # Word document
    '.docx',    # Word document (new format)
    '.html',    # HTML
    '.htm',     # HTML
    '.odt',     # OpenDocument Text
    '.rtf',     # Rich Text Format
]

# Document-specific evolution parameters
DOC_IMPROVEMENT_STEPS = 3
DOC_VALIDATION_THRESHOLD = 0.75

# Additional configuration
EVOLUTION_CONFIG = {
    'code_evolution': {
        'max_steps': 10,
        'validation_threshold': 0.85,
    },
    'document_evolution': {
        'max_steps': DOC_IMPROVEMENT_STEPS,
        'validation_threshold': DOC_VALIDATION_THRESHOLD,
        'extensions': DOCUMENT_EXTENSIONS,
    }
}