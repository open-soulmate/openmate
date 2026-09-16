import { TaskScheduler } from './task-scheduler';
import { EvolutionEngine } from './evolution-engine';
import { Logger } from './utils/logger';

export class EvolutionRunner {
  private logger: Logger;
  private taskScheduler: TaskScheduler;
  private evolutionEngine: EvolutionEngine;

  constructor() {
    this.logger = new Logger('EvolutionRunner');
    this.taskScheduler = TaskScheduler.getInstance();
    this.evolutionEngine = new EvolutionEngine();
  }

  async run(): Promise<void> {
    this.logger.info('准备启动进化任务运行...');
    
    let lockAcquired = false;
    
    try {
      // 1. 在启动进化任务前调用TaskScheduler.checkAndLock()方法
      this.logger.info('正在检查并获取任务锁...');
      const lockResult = await this.taskScheduler.checkAndLock('evolution-task');
      
      if (!lockResult.success) {
        this.logger.warn('获取任务锁失败，任务终止', {
          reason: lockResult.reason,
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      lockAcquired = true;
      this.logger.info('成功获取任务锁，锁ID:', { 
        lockId: lockResult.lockId,
        timestamp: new Date().toISOString()
      });

      // 执行进化任务
      this.logger.info('开始执行进化任务...');
      const result = await this.evolutionEngine.runEvolution();
      
      // 记录任务执行结果
      this.logger.info('进化任务执行完成', {
        result: result,
        duration: result.duration,
        iterations: result.iterations,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      // 3. 添加异常处理，确保任务失败时也能正确释放锁
      this.logger.error('进化任务执行过程中发生错误', {
        error: error instanceof Error ? error.message : '未知错误',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
      
      // 重新抛出异常，确保调用者知道任务失败
      throw error;
      
    } finally {
      // 2. 任务完成后调用TaskScheduler.unlock()释放锁
      if (lockAcquired) {
        try {
          this.logger.info('正在释放任务锁...');
          await this.taskScheduler.unlock('evolution-task');
          this.logger.info('成功释放任务锁', {
            timestamp: new Date().toISOString()
          });
        } catch (unlockError) {
          this.logger.error('释放任务锁时发生错误', {
            error: unlockError instanceof Error ? unlockError.message : '未知错误',
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // 4. 记录任务执行日志，包括锁状态变化
      this.logger.info('任务执行流程结束', {
        lockState: lockAcquired ? '已释放' : '未获取',
        timestamp: new Date().toISOString()
      });
    }
  }
}

// 启动执行
async function main() {
  const runner = new EvolutionRunner();
  
  try {
    await runner.run();
    process.exit(0);
  } catch (error) {
    console.error('进化任务执行失败:', error);
    process.exit(1);
  }
}

main();