import { type EditorUri } from '../types/EditorTypes';
import { type IDataStoreStatistics } from './IDataStoreService';

/**
 * 数据存储生命周期接口
 *
 * 负责数据存储的初始化、重载、清理和文件变更处理。
 * 将生命周期管理职责从 IDataStoreService 中分离出来，
 * 使只需要查询数据的消费者无需依赖生命周期方法。
 */
export interface IDataStoreLifecycle {
    /**
     * 初始化数据存储
     *
     * 扫描工作区中的 YAML 文件，提取模板和翻译键。
     * 此方法可以安全地多次调用，只会执行一次初始化。
     */
    initialize(): Promise<void>;

    /**
     * 检查是否已初始化
     */
    isInitialized(): boolean;

    /**
     * 重新加载所有数据
     *
     * 清空现有数据并重新扫描工作区。
     */
    reload(): Promise<void>;

    /**
     * 清空所有数据
     */
    clear(): Promise<void>;

    /**
     * 释放资源
     */
    dispose(): void;

    /**
     * 处理文件变更
     *
     * 当文件发生变更时，重新解析该文件中的模板和翻译键。
     */
    handleFileChange(fileUri: EditorUri): Promise<void>;

    /**
     * 处理文件删除
     */
    handleFileDelete(fileUri: EditorUri): Promise<void>;

    /**
     * 获取统计信息
     */
    getStatistics(): Promise<IDataStoreStatistics>;

    /**
     * 获取支持的语言列表
     */
    getSupportedLanguages(): Promise<string[]>;
}
