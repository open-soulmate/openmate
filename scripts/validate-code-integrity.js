#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const { parse } = require('acorn');
const { simple: walk } = require('acorn-walk');

// Configuration
const CONFIG = {
  targetFiles: [
    'src/components/chat-client.tsx',
    'src/components/markdown-content.tsx',
    'src/App.tsx',
    'src/main.tsx',
    'src/index.ts'
  ],
  reportPath: 'reports/integrity-check.json',
  maxFileSize: 5 * 1024 * 1024, // 5MB
  syntaxCheckEnabled: true,
  importCheckEnabled: true,
  truncationCheckEnabled: true
};

// Statistics collector
const stats = {
  timestamp: new Date().toISOString(),
  totalFiles: 0,
  passedFiles: 0,
  failedFiles: 0,
  errors: [],
  warnings: []
};

// Main validation function
async function validateCodeIntegrity() {
  console.log('Starting code integrity validation...');
  
  try {
    await validateFiles(CONFIG.targetFiles);
    await generateReport();
    
    if (stats.failedFiles > 0) {
      console.error(`Validation failed: ${stats.failedFiles} files with issues`);
      process.exit(1);
    }
    
    console.log('All files passed validation');
    process.exit(0);
  } catch (error) {
    console.error('Validation process failed:', error);
    process.exit(2);
  }
}

// Validate multiple files
async function validateFiles(filePaths) {
  const validationPromises = filePaths.map(async (filePath) => {
    stats.totalFiles++;
    
    try {
      const fullPath = path.resolve(process.cwd(), filePath);
      const result = await validateSingleFile(fullPath);
      
      if (result.passed) {
        stats.passedFiles++;
      } else {
        stats.failedFiles++;
        stats.errors.push({
          file: filePath,
          issues: result.issues
        });
      }
      
      return result;
    } catch (error) {
      stats.failedFiles++;
      stats.errors.push({
        file: filePath,
        error: error.message
      });
      return { passed: false, file: filePath, error: error.message };
    }
  });
  
  return Promise.all(validationPromises);
}

// Validate single file
async function validateSingleFile(filePath) {
  const issues = [];
  const fileName = path.basename(filePath);
  
  console.log(`Validating: ${fileName}`);
  
  try {
    // Check if file exists and is accessible
    const stat = await fs.stat(filePath);
    
    // File size validation
    if (stat.size > CONFIG.maxFileSize) {
      issues.push({
        type: 'size',
        message: `File exceeds maximum size limit: ${stat.size} bytes`
      });
    }
    
    // File size truncation detection
    if (stat.size === 0) {
      issues.push({
        type: 'truncation',
        message: 'File is empty (potential truncation)'
      });
    }
    
    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Syntax validation
    if (CONFIG.syntaxCheckEnabled) {
      const syntaxResult = validateSyntax(content, filePath);
      if (!syntaxResult.valid) {
        issues.push({
          type: 'syntax',
          message: syntaxResult.error
        });
      }
    }
    
    // Import validation
    if (CONFIG.importCheckEnabled) {
      const importResult = validateImports(content, filePath);
      if (!importResult.valid) {
        issues.push(...importResult.issues);
      }
    }
    
    // Truncation detection (advanced)
    if (CONFIG.truncationCheckEnabled) {
      const truncationResult = detectTruncation(content, filePath);
      if (truncationResult.detected) {
        issues.push({
          type: 'truncation',
          message: truncationResult.message
        });
      }
    }
    
    return {
      passed: issues.length === 0,
      file: fileName,
      issues,
      size: stat.size,
      lastModified: stat.mtime.toISOString()
    };
    
  } catch (error) {
    throw new Error(`Failed to validate file ${fileName}: ${error.message}`);
  }
}

// Validate JavaScript/TypeScript syntax
function validateSyntax(content, filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const isModule = ['.tsx', '.jsx', '.ts', '.js'].includes(ext);
    
    parse(content, {
      ecmaVersion: 'latest',
      sourceType: isModule ? 'module' : 'script',
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowImportExportEverywhere: isModule,
      allowSuperOutsideMethod: true,
      allowHashBang: true
    });
    
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Syntax error at line ${error.loc?.line || 'unknown'}: ${error.message}`
    };
  }
}

// Validate imports and dependencies
function validateImports(content, filePath) {
  const issues = [];
  const importRegex = /import\s+([\s\S]*?)\s+from\s+['"](.*?)['"];?/g;
  const requireRegex = /require\(['"](.*?)['"]\)/g;
  
  // Check import statements
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[2];
    
    // Check for common truncation patterns in imports
    if (importPath.includes('...') || importPath.includes('…')) {
      issues.push({
        type: 'import',
        message: `Potentially truncated import: ${importPath}`
      });
    }
    
    // Check for incomplete import syntax
    if (match[0].includes('from') && !match[0].includes(';')) {
      issues.push({
        type: 'import',
        message: 'Import statement may be incomplete (missing semicolon)'
      });
    }
  }
  
  // Check require statements
  while ((match = requireRegex.exec(content)) !== null) {
    const requirePath = match[1];
    
    if (requirePath.includes('...') || requirePath.includes('…')) {
      issues.push({
        type: 'require',
        message: `Potentially truncated require: ${requirePath}`
      });
    }
  }
  
  // Check for mismatched braces in JSX/TSX files
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
    const braceResult = checkBraceBalance(content);
    if (!braceResult.balanced) {
      issues.push({
        type: 'syntax',
        message: 'Unbalanced braces detected'
      });
    }
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

// Detect file truncation patterns
function detectTruncation(content, filePath) {
  const truncationPatterns = [
    { pattern: /[\s\S]{100}$/, message: 'File appears to be cut off at the end' },
    { pattern: /export\s+default\s+.*[;,{]?\s*$/, message: 'Potentially incomplete export statement' },
    { pattern: /function\s+\w+\s*\([^)]*$/, message: 'Function declaration appears incomplete' },
    { pattern: /class\s+\w+.*\{[^}]*$/, message: 'Class definition appears incomplete' },
    { pattern: /return\s+.*\([^)]*$/, message: 'Return statement with incomplete expression' }
  ];
  
  for (const { pattern, message } of truncationPatterns) {
    if (pattern.test(content)) {
      return { detected: true, message };
    }
  }
  
  // Check for missing closing tags in JSX
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
    const openTags = (content.match(/<\w+[\s>]/g) || []).length;
    const closeTags = (content.match(/<\/\w+>/g) || []).length;
    const selfClosingTags = (content.match(/<\w+[^>]*\/>/g) || []).length;
    
    if (openTags > (closeTags + selfClosingTags) + 2) { // Allow for some flexibility
      return {
        detected: true,
        message: 'Potential missing closing tags in JSX'
      };
    }
  }
  
  return { detected: false };
}

// Check brace balance
function checkBraceBalance(content) {
  let count = 0;
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    // Handle string literals
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true;
      stringChar = char;
      continue;
    }
    
    if (inString && char === stringChar && content[i-1] !== '\\') {
      inString = false;
      continue;
    }
    
    if (inString) continue;
    
    // Count braces
    if (char === '{') count++;
    if (char === '}') count--;
  }
  
  return {
    balanced: count === 0,
    difference: Math.abs(count)
  };
}

// Generate validation report
async function generateReport() {
  const reportDir = path.dirname(path.resolve(process.cwd(), CONFIG.reportPath));
  
  try {
    await fs.mkdir(reportDir, { recursive: true });
    
    const report = {
      ...stats,
      configuration: CONFIG,
      summary: {
        passRate: ((stats.passedFiles / stats.totalFiles) * 100).toFixed(2) + '%',
        totalIssues: stats.errors.reduce((acc, err) => acc + (err.issues?.length || 0), 0)
      }
    };
    
    const reportContent = JSON.stringify(report, null, 2);
    
    // Write to file
    await fs.writeFile(
      path.resolve(process.cwd(), CONFIG.reportPath),
      reportContent,
      'utf-8'
    );
    
    // Also output to console in CI environments
    if (process.env.CI) {
      console.log('\n=== VALIDATION REPORT ===');
      console.log(reportContent);
      console.log('========================\n');
    }
    
  } catch (error) {
    console.error('Failed to generate report:', error);
    // Don't fail the entire validation just because of report generation
  }
}

// Export for testing
module.exports = {
  validateCodeIntegrity,
  validateSingleFile,
  validateSyntax,
  validateImports,
  detectTruncation
};

// Run if called directly
if (require.main === module) {
  validateCodeIntegrity();
}