import * as fs from 'fs';
import * as path from 'path';

// 进化任务锁类，实现文件锁机制
export class EvolvingTaskLock {
  private locks: Map<string, { locked: boolean; processId: string; timestamp: Date }> = new Map();
  private lockDir: string;

  constructor(lockDir: string = '.evolution-locks') {
    this.lockDir = lockDir;
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true });
    }
  }

  private getLockFilePath(filePath: string): string {
    const normalPath = path.resolve(filePath);
    const lockFileName = normalPath
      .replace(/[\/\\]/g, '_')
      .replace(/:/g, '_')
      .replace(/\./g, '_') + '.lock';
    return path.join(this.lockDir, lockFileName);
  }

  async acquireLock(filePath: string, processId: string): Promise<boolean> {
    const lockPath = this.getLockFilePath(filePath);
    
    // 检查是否已有锁文件
    if (fs.existsSync(lockPath)) {
      try {
        const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        // 检查锁是否仍然有效（5分钟超时）
        const lockAge = Date.now() - new Date(lockData.timestamp).getTime();
        if (lockAge > 5 * 60 * 1000) {
          await this.releaseLock(filePath, lockData.processId);
        } else {
          return false;
        }
      } catch (error) {
        // 锁文件损坏，尝试清理
        fs.unlinkSync(lockPath);
      }
    }

    try {
      const lockData = {
        locked: true,
        processId,
        timestamp: new Date(),
        filePath: path.resolve(filePath)
      };
      fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2));
      this.locks.set(filePath, { locked: true, processId, timestamp: new Date() });
      return true;
    } catch (error) {
      console.error('Failed to acquire lock:', error);
      return false;
    }
  }

  async releaseLock(filePath: string, processId: string): Promise<void> {
    const lockPath = this.getLockFilePath(filePath);
    const lockInfo = this.locks.get(filePath);

    // 验证是否为锁的持有者
    if (lockInfo && lockInfo.processId === processId) {
      try {
        if (fs.existsSync(lockPath)) {
          fs.unlinkSync(lockPath);
        }
        this.locks.delete(filePath);
      } catch (error) {
        console.error('Failed to release lock:', error);
      }
    }
  }

  async isLocked(filePath: string): Promise<boolean> {
    const lockPath = this.getLockFilePath(filePath);
    return fs.existsSync(lockPath);
  }

  async getLockInfo(filePath: string): Promise<any> {
    const lockPath = this.getLockFilePath(filePath);
    if (fs.existsSync(lockPath)) {
      try {
        return JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// 任务调度器类，管理任务队列
export class TaskScheduler {
  private taskQueues: Map<string, Array<{ task: () => Promise<void>; taskId: string }>> = new Map();
  private processing: Map<string, boolean> = new Map();
  private lockManager: EvolvingTaskLock;

  constructor(lockDir?: string) {
    this.lockManager = new EvolvingTaskLock(lockDir);
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async addTask(
    targetFile: string,
    task: () => Promise<void>
  ): Promise<string> {
    const taskId = this.generateTaskId();
    const filePath = path.resolve(targetFile);

    // 初始化文件的任务队列
    if (!this.taskQueues.has(filePath)) {
      this.taskQueues.set(filePath, []);
    }

    // 将任务添加到队列
    const taskQueue = this.taskQueues.get(filePath)!;
    taskQueue.push({ task, taskId });

    // 如果该文件没有正在处理的任务，开始处理
    if (!this.processing.get(filePath)) {
      this.processNextTask(filePath).catch(console.error);
    }

    return taskId;
  }

  private async processNextTask(filePath: string): Promise<void> {
    const taskQueue = this.taskQueues.get(filePath);
    
    if (!taskQueue || taskQueue.length === 0) {
      this.processing.set(filePath, false);
      return;
    }

    this.processing.set(filePath, true);
    const { task, taskId } = taskQueue.shift()!;

    try {
      // 预检步骤：检查文件是否已被锁定
      const isLocked = await this.lockManager.isLocked(filePath);
      if (isLocked) {
        // 如果文件被锁定，将任务重新加入队列末尾
        taskQueue.push({ task, taskId });
        // 延迟后重试
        setTimeout(() => {
          this.processNextTask(filePath).catch(console.error);
        }, 1000);
        return;
      }

      // 获取锁
      const lockAcquired = await this.lockManager.acquireLock(filePath, taskId);
      if (!lockAcquired) {
        // 如果获取锁失败，将任务重新加入队列末尾
        taskQueue.push({ task, taskId });
        setTimeout(() => {
          this.processNextTask(filePath).catch(console.error);
        }, 1000);
        return;
      }

      // 执行任务
      console.log(`Starting task ${taskId} for file: ${filePath}`);
      await task();
      console.log(`Completed task ${taskId} for file: ${filePath}`);
    } catch (error) {
      console.error(`Task ${taskId} failed for file ${filePath}:`, error);
    } finally {
      // 任务完成回调：释放锁并处理后续任务
      await this.lockManager.releaseLock(filePath, taskId);
      // 处理队列中的下一个任务
      await this.processNextTask(filePath);
    }
  }

  async cancelTask(taskId: string): Promise<boolean> {
    for (const [filePath, taskQueue] of this.taskQueues) {
      const index = taskQueue.findIndex(t => t.taskId === taskId);
      if (index !== -1) {
        taskQueue.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  getQueueStatus(): { filePath: string; queueLength: number; isProcessing: boolean }[] {
    const status: { filePath: string; queueLength: number; isProcessing: boolean }[] = [];
    
    for (const [filePath, taskQueue] of this.taskQueues) {
      status.push({
        filePath,
        queueLength: taskQueue.length,
        isProcessing: this.processing.get(filePath) || false
      });
    }

    return status;
  }
}

// 进化任务执行器
export class EvolutionTaskExecutor {
  private scheduler: TaskScheduler;
  private lockManager: EvolvingTaskLock;

  constructor(lockDir?: string) {
    this.scheduler = new TaskScheduler(lockDir);
    this.lockManager = new EvolvingTaskLock(lockDir);
  }

  async executeEvolution(
    targetFile: string,
    evolutionFunction: (file: string) => Promise<void>
  ): Promise<string> {
    return await this.scheduler.addTask(targetFile, async () => {
      // 任务开始前的预检
      const filePath = path.resolve(targetFile);
      
      // 1. 检查目标文件是否存在
      if (!fs.existsSync(filePath)) {
        throw new Error(`Target file does not exist: ${filePath}`);
      }

      // 2. 检查文件是否可写
      try {
        fs.accessSync(filePath, fs.constants.W_OK);
      } catch (error) {
        throw new Error(`No write permission for file: ${filePath}`);
      }

      // 3. 执行进化函数
      await evolutionFunction(filePath);
    });
  }

  async cancelTask(taskId: string): Promise<boolean> {
    return await this.scheduler.cancelTask(taskId);
  }

  getQueueStatus(): { filePath: string; queueLength: number; isProcessing: boolean }[] {
    return this.scheduler.getQueueStatus();
  }

  async forceReleaseLock(filePath: string, processId: string): Promise<void> {
    await this.lockManager.releaseLock(filePath, processId);
  }
}

// 默认实例
export const evolutionTaskExecutor = new EvolutionTaskExecutor();