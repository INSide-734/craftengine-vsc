import {
    type DefinitionProvider,
    type TextDocument,
    Position,
    type Definition,
    type LocationLink,
    Range,
    type CancellationToken,
    Uri,
} from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { type ILogger } from '../../core/interfaces/ILogger';
import { type IConfiguration } from '../../core/interfaces/IConfiguration';
import { type ISchemaService } from '../../core/interfaces/ISchemaService';
import { type IYamlPathParser } from '../../core/interfaces/IYamlPathParser';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { type PerformanceMonitor } from '../../infrastructure/performance/PerformanceMonitor';
import { YamlHelper } from '../../infrastructure/yaml/YamlHelper';

/**
 * 分类定义跳转提供者
 *
 * 提供从分类引用位置跳转到分类定义的功能
 * 基于 Schema 的 x-completion-provider 属性判断字段类型
 */
export class CategoryDefinitionProvider implements DefinitionProvider {
    private readonly dataStoreService: IDataStoreService;
    private readonly logger: ILogger;
    private readonly configuration: IConfiguration;
    private readonly performanceMonitor: PerformanceMonitor;
    private readonly schemaService: ISchemaService;
    private readonly yamlPathParser: IYamlPathParser;

    /** 分类引用补全提供者标识 */
    private static readonly CATEGORY_REFERENCE_PROVIDER = 'craftengine.categoryReference';

    /** 分类引用正则表达式 */
    private static readonly CATEGORY_REFERENCE_PATTERN = /#[a-z][a-z0-9_-]*:[a-z][a-z0-9_/-]*/g;

    constructor() {
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(SERVICE_TOKENS.DataStoreService);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild(
            'CategoryDefinitionProvider',
        );
        this.configuration = ServiceContainer.getService<IConfiguration>(SERVICE_TOKENS.Configuration);
        this.performanceMonitor = ServiceContainer.getService<PerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor);
        this.schemaService = ServiceContainer.getService<ISchemaService>(SERVICE_TOKENS.SchemaService);
        this.yamlPathParser = ServiceContainer.getService<IYamlPathParser>(SERVICE_TOKENS.YamlPathParser);
    }

    async provideDefinition(
        document: TextDocument,
        position: Position,
        token?: CancellationToken,
    ): Promise<Definition | LocationLink[] | undefined> {
        const timer = this.performanceMonitor.startTimer('category-definition.provide');

        try {
            // 检查功能是否启用
            if (!this.configuration.get('definition.enabled', true)) {
                return undefined;
            }

            if (token?.isCancellationRequested) {
                return undefined;
            }

            this.logger.debug('Providing category definition', {
                file: document.fileName,
                line: position.line,
                character: position.character,
            });

            // 获取光标位置的分类引用和范围
            const categoryInfo = await this.getCategoryReferenceAtPosition(document, position);
            if (!categoryInfo) {
                this.logger.debug('No category reference found at position');
                return undefined;
            }

            this.logger.debug('Category reference detected for definition', {
                categoryId: categoryInfo.id,
                range: categoryInfo.range,
            });

            // 查找分类定义
            const category = await this.dataStoreService.getCategoryById(categoryInfo.id);

            if (!category) {
                this.logger.debug('Category definition not found', { categoryId: categoryInfo.id });
                return undefined;
            }

            // 创建定义位置
            const targetPosition =
                category.lineNumber !== undefined ? new Position(category.lineNumber, 0) : new Position(0, 0);
            const targetRange = new Range(targetPosition, targetPosition);

            const locationLink: LocationLink = {
                // 源文件中的选择范围（完整的分类引用）
                originSelectionRange: categoryInfo.range,
                // 目标文件 URI
                targetUri: Uri.file(category.sourceFile),
                // 目标范围（用于预览显示的范围）
                targetRange: targetRange,
                // 目标选择范围（光标定位的精确位置）
                targetSelectionRange: targetRange,
            };

            this.logger.debug('Category definition found', {
                categoryId: categoryInfo.id,
                file: category.sourceFile,
                line: category.lineNumber,
            });

            return [locationLink];
        } catch (error) {
            this.logger.error('Error providing category definition', error as Error, {
                file: document.fileName,
                position: { line: position.line, character: position.character },
            });
            return undefined;
        } finally {
            timer.stop({ document: document.fileName });
        }
    }

    /**
     * 获取光标位置的分类引用和范围
     */
    private async getCategoryReferenceAtPosition(
        document: TextDocument,
        position: Position,
    ): Promise<{ id: string; range: Range } | undefined> {
        const line = document.lineAt(position);
        const lineText = line.text;

        // 先检查光标是否在注释中
        if (YamlHelper.isInComment(lineText, position.character)) {
            return undefined;
        }

        // 重置正则表达式
        CategoryDefinitionProvider.CATEGORY_REFERENCE_PATTERN.lastIndex = 0;

        // 查找行中的分类引用
        let match;
        while ((match = CategoryDefinitionProvider.CATEGORY_REFERENCE_PATTERN.exec(lineText)) !== null) {
            const categoryId = match[0];
            const startPos = match.index;
            const endPos = startPos + categoryId.length;

            // 检查光标是否在分类引用范围内
            if (position.character >= startPos && position.character <= endPos) {
                // 基于 Schema 验证此位置是否期望分类引用
                const isCategoryField = await this.isCategoryFieldBySchema(document, position);

                if (isCategoryField) {
                    const range = new Range(position.line, startPos, position.line, endPos);
                    return { id: categoryId, range };
                }
            }
        }

        return undefined;
    }

    /**
     * 基于 Schema 检查位置是否期望分类引用
     */
    private async isCategoryFieldBySchema(document: TextDocument, position: Position): Promise<boolean> {
        try {
            // 解析 YAML 路径
            const path = this.yamlPathParser.parsePath(document, position);

            if (path.length === 0) {
                return false;
            }

            // 获取该路径的 Schema
            const schema = await this.schemaService.getSchemaForPath(path);

            if (!schema) {
                return false;
            }

            // 检查 Schema 的 x-completion-provider 属性
            const completionProvider = this.schemaService.getCustomProperty(schema, 'completion-provider');

            return completionProvider === CategoryDefinitionProvider.CATEGORY_REFERENCE_PROVIDER;
        } catch (error) {
            this.logger.debug('Error checking schema for category field', {
                error: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    }
}
