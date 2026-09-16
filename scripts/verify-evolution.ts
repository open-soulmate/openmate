import * as fs from 'fs';
import * as path from 'path';
import { execSync, ExecSyncOptions } from 'child_process';
import * as chalk from 'chalk';

interface EvolutionItem {
  id: string;
  description: string;
  type: 'type_check' | 'unit_test' | 'lint' | 'other';
  command: string;
  expectedResult: number;
  affectedFiles?: string[];
}

interface EvolutionManifest {
  items: EvolutionItem[];
}

interface VerificationFailure {
  file: string;
  line: number;
  column?: number;
  message: string;
  type: 'type_check' | 'dependency' | 'hook_rule';
}

function loadEvolutionManifest(): EvolutionManifest {
  const manifestPath = path.join(__dirname, '..', 'evolution-manifest.json');
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content) as EvolutionManifest;
  } catch (error) {
    console.error(chalk.red('Failed to load evolution manifest:'), error);
    process.exit(1);
  }
}

function loadPackageJson(): Record<string, any> {
  const packagePath = path.join(__dirname, '..', 'package.json');
  try {
    const content = fs.readFileSync(packagePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(chalk.red('Failed to load package.json:'), error);
    return {};
  }
}

function runTypeCheck(files: string[]): VerificationFailure[] {
  const failures: VerificationFailure[] = [];
  
  if (files.length === 0) {
    return failures;
  }

  try {
    const filesArgs = files.map(f => `"${f}"`).join(' ');
    const command = `npx tsc --noEmit ${filesArgs}`;
    console.log(chalk.gray(`  Running type check: ${command}`));
    
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 300000,
      stdio: 'pipe',
    });
    
    // 如果命令成功执行（exitCode === 0），则没有类型错误
    return failures;
  } catch (error: any) {
    // 如果命令失败（exitCode !== 0），解析错误输出
    const output = error.stdout || error.stderr || '';
    const lines = output.split('\n').filter((line: string) => line.trim());
    
    const errorPattern = /^(.+?)\((\d+),(\d+)\): error TS\d+: (.+)$/;
    
    for (const line of lines) {
      const match = line.match(errorPattern);
      if (match) {
        failures.push({
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          message: match[4],
          type: 'type_check',
        });
      }
    }
    
    return failures;
  }
}

function validateImports(files: string[]): VerificationFailure[] {
  const failures: VerificationFailure[] = [];
  const packageJson = loadPackageJson();
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      
      // 简单正则匹配import语句
      const importPattern = /^import\s+.*from\s+['"]([^'"]+)['"]|^import\s+['"]([^'"]+)['"]|^require\s*\(\s*['"]([^'"]+)['"]\s*\)/;
      
      lines.forEach((line, index) => {
        const match = line.match(importPattern);
        if (match) {
          const moduleName = match[1] || match[2] || match[3];
          
          // 跳过相对路径和node内置模块
          if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
            // 检查模块名是否以@开头（scoped package）或者是普通包名
            const packageName = moduleName.startsWith('@') 
              ? moduleName.split('/').slice(0, 2).join('/') 
              : moduleName.split('/')[0];
            
            if (!dependencies[packageName] && !dependencies[`${packageName}/`]) {
              failures.push({
                file,
                line: index + 1,
                message: `Module '${packageName}' is not listed in package.json dependencies`,
                type: 'dependency',
              });
            }
          }
        }
      });
    } catch (error) {
      // 文件读取失败，跳过
      console.log(chalk.yellow(`  Warning: Could not read file ${file} for import validation`));
    }
  }
  
  return failures;
}

function validateHookRules(files: string[]): VerificationFailure[] {
  const failures: VerificationFailure[] = [];
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      
      // 简单正则匹配React Hook使用
      const hookPattern = /(?:^|\s)(useState|useEffect|useContext|useReducer|useCallback|useMemo|useRef|useImperativeHandle|useLayoutEffect|useDebugValue)\s*\(/;
      const conditionalPattern = /^\s*(if|else|switch|for|while|try|catch|finally)\s*[\({]/;
      const functionPattern = /(?:^|\s)(function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|\w+)|class\s+\w+)/;
      
      let insideConditional = false;
      let insideFunction = false;
      let braceCount = 0;
      
      lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        
        // 检查是否进入条件语句
        if (conditionalPattern.test(trimmedLine)) {
          insideConditional = true;
        }
        
        // 检查是否进入函数定义
        if (functionPattern.test(trimmedLine)) {
          insideFunction = true;
        }
        
        // 简单的大括号计数来跟踪作用域
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        braceCount += openBraces - closeBraces;
        
        // 如果大括号计数回到0，我们离开了当前作用域
        if (braceCount <= 0) {
          insideConditional = false;
          insideFunction = false;
          braceCount = 0;
        }
        
        // 检查Hook使用
        if (hookPattern.test(line)) {
          const hookMatch = line.match(hookPattern);
          const hookName = hookMatch ? hookMatch[1] : 'Unknown Hook';
          
          // 规则1：Hooks不能在条件语句中调用
          if (insideConditional) {
            failures.push({
              file,
              line: index + 1,
              message: `Hook '${hookName}' is called conditionally. Hooks must not be called inside conditions.`,
              type: 'hook_rule',
            });
          }
          
          // 规则2：Hooks不能在普通函数中调用（只能在React组件或自定义Hook中）
          if (insideFunction) {
            // 简单启发式：检查函数名是否以use开头或者是组件
            const isComponentOrHook = /(?:^|\s)(function\s+use|const\s+use)/.test(trimmedLine);
            
            if (!isComponentOrHook) {
              failures.push({
                file,
                line: index + 1,
                message: `Hook '${hookName}' is called inside a non-React function. Hooks must only be called in React function components or custom hooks.`,
                type: 'hook_rule',
              });
            }
          }
        }
      });
    } catch (error) {
      // 文件读取失败，跳过
      console.log(chalk.yellow(`  Warning: Could not read file ${file} for hook validation`));
    }
  }
  
  return failures;
}

function verifyEvolutionItem(item: EvolutionItem): { passed: boolean; failures: VerificationFailure[] } {
  console.log(chalk.blue(`\nVerifying: ${item.description} [${item.id}]`));
  const allFailures: VerificationFailure[] = [];
  
  try {
    console.log(chalk.gray(`  Command: ${item.command}`));
    const output = execSync(item.command, {
      encoding: 'utf-8',
      timeout: 300000,
      stdio: 'pipe',
    });
    
    const exitCode = 0;
    const passed = exitCode === item.expectedResult;
    
    if (passed) {
      console.log(chalk.green(`  ✓ Passed (exit code: ${exitCode})`));
    } else {
      console.log(chalk.red(`  ✗ Failed (expected: ${item.expectedResult}, got: ${exitCode})`));
      if (output) {
        console.log(chalk.gray(`  Output:\n${output}`));
      }
    }
    
    // 如果命令失败，添加到失败列表
    if (!passed) {
      allFailures.push({
        file: item.affectedFiles ? item.affectedFiles.join(', ') : 'Unknown',
        line: 0,
        message: `Command failed with exit code ${exitCode}`,
        type: 'type_check', // 分类为运行时验证失败
      });
    }
    
    return { passed, failures: allFailures };
  } catch (error: any) {
    console.log(chalk.red(`  ✗ Failed with error: ${error.message}`));
    
    allFailures.push({
      file: item.affectedFiles ? item.affectedFiles.join(', ') : 'Unknown',
      line: 0,
      message: error.message,
      type: 'type_check', // 分类为运行时验证失败
    });
    
    return { passed: false, failures: allFailures };
  }
}

function runRuntimeVerification(item: EvolutionItem): VerificationFailure[] {
  const failures: VerificationFailure[] = [];
  
  if (!item.affectedFiles || item.affectedFiles.length === 0) {
    return failures;
  }
  
  console.log(chalk.gray(`  Running runtime verification for ${item.affectedFiles.length} file(s)`));
  
  // 1. 类型检查
  const typeCheckFailures = runTypeCheck(item.affectedFiles);
  failures.push(...typeCheckFailures);
  
  // 2. 导入依赖验证
  const importFailures = validateImports(item.affectedFiles);
  failures.push(...importFailures);
  
  // 3. React Hook规则验证（如果文件可能包含React组件）
  const hookFailures = validateHookRules(item.affectedFiles);
  failures.push(...hookFailures);
  
  return failures;
}

function main(): void {
  console.log(chalk.bold('Starting evolution verification...'));
  
  // 1. 确保计数器在验证开始时正确初始化
  let failedCount = 0;
  let passedCount = 0;
  let totalItems = 0;
  let hasEvolutionItems = false;
  const allVerificationFailures: VerificationFailure[] = [];
  
  const manifest = loadEvolutionManifest();
  
  // 检查是否有改进项
  if (manifest.items && manifest.items.length > 0) {
    hasEvolutionItems = true;
    totalItems = manifest.items.length;
    
    console.log(chalk.blue(`Found ${totalItems} evolution item(s) to verify.`));
    
    for (const item of manifest.items) {
      // 运行主要命令验证
      const result = verifyEvolutionItem(item);
      let itemPassed = result.passed;
      let itemFailures = result.failures;
      
      // 运行额外的运行时验证
      const runtimeFailures = runRuntimeVerification(item);
      itemFailures = itemFailures.concat(runtimeFailures);
      
      // 如果有运行时验证失败，标记为失败
      if (runtimeFailures.length > 0) {
        itemPassed = false;
        console.log(chalk.red(`  ✗ Runtime verification failed with ${runtimeFailures.length} issue(s)`));
      }
      
      // 2. 审查并修正计数器的递增条件，确保仅当检测到明确的改进失败时才递增
      if (!itemPassed) {
        failedCount++;
        allVerificationFailures.push(...itemFailures);
        
        // 输出失败详情
        console.log(chalk.red(`  Failed verification details:`));
        for (const failure of itemFailures) {
          const location = failure.line > 0 
            ? `${failure.file}:${failure.line}${failure.column ? `:${failure.column}` : ''}`
            : failure.file;
          
          console.log(chalk.red(`    - ${failure.type}: ${location} - ${failure.message}`));
        }
      } else {
        passedCount++;
      }
    }
  } else {
    console.log(chalk.yellow('No evolution items found in manifest.'));
  }
  
  // 3. 区分三种状态并输出结果
  console.log(chalk.bold('\n=== Verification Summary ==='));
  
  if (!hasEvolutionItems) {
    // 状态1: 无改进项
    console.log(chalk.yellow('No improvements to verify.'));
  } else if (failedCount === 0) {
    // 状态2: 有改进项且全部通过
    console.log(chalk.green(`All ${totalItems} improvements passed verification.`));
  } else {
    // 状态3: 有改进项但部分/全部失败
    console.log(chalk.red(`${failedCount} out of ${totalItems} improvements failed verification.`));
    
    if (allVerificationFailures.length > 0) {
      console.log(chalk.red(`\nRuntime verification failures:`));
      
      // 按类型分组显示失败
      const failuresByType = allVerificationFailures.reduce((acc, failure) => {
        acc[failure.type] = acc[failure.type] || [];
        acc[failure.type].push(failure);
        return acc;
      }, {} as Record<string, VerificationFailure[]>);
      
      for (const [type, failures] of Object.entries(failuresByType)) {
        console.log(chalk.red(`\n  ${type.toUpperCase()} (${failures.length} issue(s)):`));
        for (const failure of failures) {
          const location = failure.line > 0 
            ? `${failure.file}:${failure.line}${failure.column ? `:${failure.column}` : ''}`
            : failure.file;
          
          console.log(chalk.red(`    - ${location}: ${failure.message}`));
        }
      }
    }
  }
  
  // 如果有验证失败，退出码为1
  if (failedCount > 0) {
    process.exit(1);
  }
}

main();