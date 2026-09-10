class FileRenameMethods:
    @staticmethod
    def get_available_methods():
        """Return multiple file rename methods for flexibility"""
        return {
            'shell': {
                'name': 'Shell Command',
                'description': 'Fast, direct command-line renaming',
                'risk_level': 'medium',
                'best_for': 'Single file, simple patterns'
            },
            'python_os': {
                'name': 'Python os module',
                'description': 'Cross-platform, programmatic renaming',
                'risk_level': 'low',
                'best_for': 'Batch operations, cross-platform compatibility'
            },
            'regex': {
                'name': 'Regex-based renaming',
                'description': 'Pattern-based renaming with regex support',
                'risk_level': 'medium',
                'best_for': 'Complex patterns, bulk renaming'
            }
        }

    @staticmethod
    def recommend_method(params):
        """Suggest best method based on context"""
        if params.get('batch'):
            return 'python_os'
        if params.get('complex_pattern'):
            return 'regex'
        return 'shell'