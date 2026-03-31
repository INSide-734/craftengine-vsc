import { type EditorUri } from '../../../../core/types/EditorTypes';
import { type ILogger } from '../../../../core/interfaces/ILogger';
import { type IFileReader } from '../../../../core/interfaces/IFileReader';
import { type IYamlParser } from '../../../../core/interfaces/IYamlParser';
import { type TemplateStore } from '../TemplateStore';
import { type TranslationStore } from '../TranslationStore';
import { type TranslationReferenceStore } from '../TranslationReferenceStore';
import { type ItemStore } from '../ItemStore';
import { type CategoryStore } from '../CategoryStore';
import { type DocumentProcessor } from '../DocumentProcessor';

/**
 * 文件变更处理器
 *
 * 负责处理文件的变更和删除事件。
 * 确保存储中的数据与文件系统保持同步。
 *
 * @remarks
 * **处理流程**：
 *
 * **文件变更**：
 * 1. 从所有存储中移除旧数据
 * 2. 读取文件内容
 * 3. 解析 YAML
 * 4. 如果解析成功，重新处理文档
 *
 * **文件删除**：
 * 1. 从所有存储中移除相关数据
 *
 * @example
 * ```typescript
 * const handler = new FileChangeHandler(
 *     logger,
 *     fileReader,
 *     yamlParser,
 *     documentProcessor,
 *     templateStore,
 *     translationStore,
 *     translationReferenceStore,
 *     itemStore,
 *     categoryStore
 * );
 *
 * // 处理文件变更
 * await handler.handleFileChange(fileUri);
 *
 * // 处理文件删除
 * await handler.handleFileDelete(fileUri);
 * ```
 */
export class FileChangeHandler {
    /**
     * 构造文件变更处理器实例
     *
     * @param logger - 日志记录器
     * @param fileReader - 文件读取器
     * @param yamlParser - YAML 解析器
     * @param documentProcessor - 文档处理器
     * @param templateStore - 模板存储
     * @param translationStore - 翻译存储
     * @param translationReferenceStore - 翻译引用存储
     * @param itemStore - 物品存储
     * @param categoryStore - 分类存储
     */
    constructor(
        private readonly logger: ILogger,
        private readonly fileReader: IFileReader,
        private readonly yamlParser: IYamlParser,
        private readonly documentProcessor: DocumentProcessor,
        private readonly templateStore: TemplateStore,
        private readonly translationStore: TranslationStore,
        private readonly translationReferenceStore: TranslationReferenceStore,
        private readonly itemStore: ItemStore,
        private readonly categoryStore: CategoryStore,
    ) {}

    /**
     * 处理文件变更
     *
     * @param fileUri - 文件 URI
     * @returns Promise，表示处理完成
     */
    async handleFileChange(fileUri: EditorUri): Promise<void> {
        // 先移除旧数据
        await this.templateStore.removeByFile(fileUri);
        await this.translationStore.removeByFile(fileUri);
        this.translationReferenceStore.removeByFile(fileUri.fsPath);
        await this.itemStore.removeItemsByFile(fileUri);
        await this.categoryStore.removeCategoriesByFile(fileUri);

        try {
            // 读取文件内容
            const fileContent = await this.fileReader.readFile(fileUri);
            const content = new TextDecoder('utf-8').decode(fileContent);

            // 解析 YAML
            const parseResult = await this.yamlParser.parseText(content, fileUri);
            if (parseResult.errors.length === 0) {
                // 重新处理文档
                await this.documentProcessor.processDocument(fileUri, content);
            }
        } catch (error) {
            this.logger.warn('Failed to process file change', {
                file: fileUri.fsPath,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * 处理文件删除
     *
     * @param fileUri - 文件 URI
     * @returns Promise，表示处理完成
     */
    async handleFileDelete(fileUri: EditorUri): Promise<void> {
        await this.templateStore.removeByFile(fileUri);
        await this.translationStore.removeByFile(fileUri);
        this.translationReferenceStore.removeByFile(fileUri.fsPath);
        await this.itemStore.removeItemsByFile(fileUri);
        await this.categoryStore.removeCategoriesByFile(fileUri);
    }
}
