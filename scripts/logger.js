#!/usr/bin/env node

/**
 * 日志工具
 * 提供彩色日志输出和进度显示
 */

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/**
 * 日志记录器类
 */
export class Logger {
  /**
   * 构造函数
   * @param {string} prefix - 日志前缀
   */
  constructor(prefix = '') {
    this.prefix = prefix;
  }

  /**
   * 信息日志
   * @param {string} message - 日志消息
   */
  info(message) {
    console.log(`${colors.blue}ℹ${colors.reset} ${this.prefix}${message}`);
  }

  /**
   * 成功日志
   * @param {string} message - 日志消息
   */
  success(message) {
    console.log(`${colors.green}✓${colors.reset} ${this.prefix}${message}`);
  }

  /**
   * 警告日志
   * @param {string} message - 日志消息
   */
  warn(message) {
    console.warn(`${colors.yellow}⚠${colors.reset} ${this.prefix}${message}`);
  }

  /**
   * 错误日志
   * @param {string} message - 日志消息
   * @param {Error} [error] - 错误对象
   */
  error(message, error) {
    console.error(`${colors.red}✘${colors.reset} ${this.prefix}${message}`);
    if (error) {
      if (error.stack) {
        console.error(colors.dim + error.stack + colors.reset);
      } else if (error.message) {
        console.error(colors.dim + error.message + colors.reset);
      }
    }
  }

  /**
   * 进度显示
   * @param {number} current - 当前进度
   * @param {number} total - 总数
   * @param {string} message - 进度消息
   */
  progress(current, total, message) {
    const percentage = Math.round((current / total) * 100);
    const barLength = 50;
    const filledLength = Math.floor((percentage / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

    process.stdout.write(
      `\r${colors.cyan}${bar}${colors.reset} ${percentage}% ${message}`
    );

    if (current === total) {
      process.stdout.write('\n');
    }
  }

  /**
   * 调试日志（仅在 DEBUG 环境变量设置时显示）
   * @param {string} message - 日志消息
   */
  debug(message) {
    if (process.env.DEBUG) {
      console.log(`${colors.dim}[DEBUG]${colors.reset} ${this.prefix}${message}`);
    }
  }
}

/**
 * 默认日志记录器实例
 */
export const logger = new Logger();
