import os
import json
import sys

class MCPClient:
    def __init__(self):
        self.project_root = os.getcwd()
        self.package_json_path = os.path.join(self.project_root, 'package.json')
        self.validate_environment()

    def validate_environment(self):
        """
        Validate the environment before running the evolution process.
        Check for incompatible dependencies in package.json.
        """
        self._check_echarts_for_react_dependency()

    def _check_echarts_for_react_dependency(self):
        """
        Check if 'echarts-for-react' is listed in the dependencies of package.json.
        If found, raise an error to block the evolution process.
        """
        if not os.path.exists(self.package_json_path):
            return  # No package.json found, skip check

        try:
            with open(self.package_json_path, 'r') as f:
                package_data = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            print(f"Warning: Could not read package.json: {e}")
            return

        dependencies = package_data.get('dependencies', {})
        if 'echarts-for-react' in dependencies:
            error_message = (
                "Error: 'echarts-for-react' dependency detected in package.json. "
                "This may cause incompatible issues during the evolution process. "
                "Please remove or replace it to avoid silent failures."
            )
            print(error_message, file=sys.stderr)
            raise RuntimeError(error_message)

        # Ensure we don't check devDependencies to avoid misjudgment
        dev_dependencies = package_data.get('devDependencies', {})
        if 'echarts-for-react' in dev_dependencies:
            # Found in devDependencies, but still warn if it's a potential risk
            warning_message = (
                "Warning: 'echarts-for-react' found in devDependencies. "
                "While this may not directly affect production, please verify compatibility."
            )
            print(warning_message, file=sys.stderr)

    def run_evolution(self, test_cases):
        """
        Run the evolution validation with provided test cases.
        """
        # Ensure environment is validated before proceeding
        self.validate_environment()
        # Additional logic for running evolution (placeholder)
        print("Running evolution validation...")
        # Simulate processing
        for case in test_cases:
            print(f"Processing test case: {case}")
        return "Evolution completed successfully."

# Example usage or entry point
if __name__ == "__main__":
    client = MCPClient()
    test_cases = ["test1", "test2", "test3"]
    result = client.run_evolution(test_cases)
    print(result)