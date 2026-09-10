const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class SelfIntrospection {
  constructor() {
    this.cwd = process.cwd();
    this.maxScanDepth = 3; // Limit scan depth for performance
    this.projectFilePatterns = [
      'package.json',
      'requirements.txt',
      '*.py',
      '*.ts',
      '*.js',
      '*.jsx',
      '*.tsx',
      'Dockerfile',
      '.gitignore',
      'README.md'
    ];
  }

  async scanDirectory(dirPath, depth = 0) {
    const results = [];
    if (depth > this.maxScanDepth) return results;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.cwd, fullPath);
        
        if (entry.isDirectory()) {
          // Add directory to results and scan recursively
          results.push({
            path: relativePath,
            type: 'directory',
            isWritable: await this.checkWritePermission(fullPath)
          });
          
          // Skip node_modules and .git directories for performance
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
            const subResults = await this.scanDirectory(fullPath, depth + 1);
            results.push(...subResults);
          }
        } else {
          results.push({
            path: relativePath,
            type: 'file',
            extension: path.extname(entry.name).toLowerCase(),
            isProjectFile: this.isProjectFile(entry.name)
          });
        }
      }
    } catch (error) {
      console.error(`Error scanning ${dirPath}:`, error.message);
    }

    return results;
  }

  isProjectFile(filename) {
    return this.projectFilePatterns.some(pattern => {
      if (pattern.startsWith('*')) {
        return filename.endsWith(pattern.slice(1));
      }
      return filename === pattern;
    });
  }

  async checkWritePermission(dirPath) {
    try {
      const testFile = path.join(dirPath, '.permission_test_' + Date.now());
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      return true;
    } catch {
      return false;
    }
  }

  async detectExecutableEnvironments() {
    const environments = [];
    
    // Node.js
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
      environments.push({
        name: 'node',
        version: nodeVersion,
        path: process.execPath
      });
    } catch (error) {
      console.error('Node.js detection failed:', error.message);
    }

    // npm
    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      environments.push({
        name: 'npm',
        version: npmVersion,
        path: execSync('which npm', { encoding: 'utf8' }).trim()
      });
    } catch (error) {
      console.error('npm detection failed:', error.message);
    }

    // Python
    try {
      const pythonVersion = execSync('python --version 2>&1', { encoding: 'utf8' }).trim();
      environments.push({
        name: 'python',
        version: pythonVersion.replace('Python ', ''),
        path: execSync('which python', { encoding: 'utf8' }).trim()
      });
    } catch (error) {
      console.error('Python detection failed:', error.message);
    }

    // TypeScript (tsc)
    try {
      const tscVersion = execSync('tsc --version', { encoding: 'utf8' }).trim();
      environments.push({
        name: 'typescript',
        version: tscVersion.replace('Version ', ''),
        path: execSync('which tsc', { encoding: 'utf8' }).trim()
      });
    } catch (error) {
      console.error('TypeScript detection failed:', error.message);
    }

    return environments;
  }

  async getWritablePaths(scanResults) {
    return scanResults
      .filter(item => item.type === 'directory' && item.isWritable)
      .map(item => path.resolve(this.cwd, item.path));
  }

  async execute() {
    const startTime = Date.now();
    
    try {
      // Scan directory structure
      const scanResults = await this.scanDirectory(this.cwd);
      
      // Extract project files
      const projectFiles = scanResults
        .filter(item => item.isProjectFile)
        .map(item => item.path);

      // Detect executable environments
      const executableLanguages = await this.detectExecutableEnvironments();

      // Get writable paths
      const writablePaths = await this.getWritablePaths(scanResults);

      // Structure the response
      const result = {
        timestamp: new Date().toISOString(),
        scan_duration_ms: Date.now() - startTime,
        working_directory: this.cwd,
        environment: {
          platform: process.platform,
          arch: process.arch,
          node_version: process.version,
          pid: process.pid,
          memory_usage: process.memoryUsage()
        },
        project_files: projectFiles,
        executable_languages: executableLanguages,
        writable_paths: writablePaths,
        directory_structure_summary: {
          total_files: scanResults.filter(item => item.type === 'file').length,
          total_directories: scanResults.filter(item => item.type === 'directory').length,
          project_files_count: projectFiles.length,
          scan_depth: this.maxScanDepth
        },
        capabilities: {
          can_run_javascript: true,
          can_run_python: executableLanguages.some(env => env.name === 'python'),
          can_run_typescript: executableLanguages.some(env => env.name === 'typescript'),
          has_write_access: writablePaths.length > 0,
          has_package_manager: executableLanguages.some(env => env.name === 'npm')
        }
      };

      return result;
    } catch (error) {
      return {
        timestamp: new Date().toISOString(),
        error: error.message,
        success: false
      };
    }
  }
}

// Export the execute function for direct usage
module.exports = {
  execute: async () => {
    const introspection = new SelfIntrospection();
    return introspection.execute();
  },
  SelfIntrospection
};