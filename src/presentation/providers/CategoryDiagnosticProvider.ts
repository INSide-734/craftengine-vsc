import { type TextDocument, type Diagnostic, Range, Position } from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { YamlHelper } from '../../infrastructure/yaml/YamlHelper';
import { CATEGORY_NOT_FOUND } from '../../core/constants/DiagnosticCodes';
import { REFERENCE_MESSAGES } from '../../core/constants/DiagnosticMessages';
import { BaseDiagnosticProvider } from './BaseDiagnosticProvider';
import { SchemaFieldIdentifier } from './helpers/SchemaFieldIdentifier';
import { type ISchemaService } from '../../core/interfaces/ISchemaService';
import { type IYamlPathParser } from '../../core/interfaces/IYamlPathParser';

/**
 * 分类引用信息
 */
interface ICategoryReference {
    /** 分类 ID（带 # 前缀） */
    id: string;
    /** 引用位置范围 */
    range: Range;
    /** 行号 */
    line: number;
}

/**
 * 分类诊断提供者
 *
 * 提供实时分类引用错误检测和诊断信息
 * 基于 Schema 的 x-completion-provider 属性判断字段类型
 */
export class CategoryDiagnosticProvider extends BaseDiagnosticProvider {
    private readonly dataStoreService: IDataStoreService;
    private readonly fieldIdentifier: SchemaFieldIdentifier;

    /** 诊断源标识 */
    static readonly DIAGNOSTIC_SOURCE = 'CraftEngine Category';

    /** 分类引用补全提供者标识 */
    private static readonly CATEGORY_REFERENCE_PROVIDER = 'craftengine.categoryReference';

    /** 分类引用正则表达式（带 # 前缀的命名空间格式） */
    private static readonly CATEGORY_REFERENCE_PATTERN = /#[a-z][a-z0-9_-]*:[a-z][a-z0-9_/-]*/g;

    constructor() {
        super(
            'craftengine-category',
            'CraftEngine Category',
            'category-diagnostics.update',
            'CategoryDiagnosticProvider',
        );
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(SERVICE_TOKENS.DataStoreService);
        const schemaService = ServiceContainer.getService<ISchemaService>(SERVICE_TOKENS.SchemaService);
        const yamlPathParser = ServiceContainer.getService<IYamlPathParser>(SERVICE_TOKENS.YamlPathParser);
        this.fieldIdentifier = new SchemaFieldIdentifier(schemaService, yamlPathParser);
    }

    /**
     * 执行分类引用诊断
     */
    protected async doUpdateDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];

        // 查找所有分类引用
        const references = await this.findICategoryReferences(document);

        // 验证每个引用
        for (const ref of references) {
            const validationDiagnostics = await this.validateICategoryReference(ref, document);
            diagnostics.push(...validationDiagnostics);
        }

        return diagnostics;
    }

    /**
     * 查找文档中的分类引用
     */
    private async findICategoryReferences(document: TextDocument): Promise<ICategoryReference[]> {
        const references: ICategoryReference[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const lineText = lines[lineNum];

            // 跳过空行和纯注释行
            const trimmedLine = lineText.trim();
            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue;
            }

            // 重置正则表达式
            CategoryDiagnosticProvider.CATEGORY_REFERENCE_PATTERN.lastIndex = 0;

            // 查找行中可能的分类引用
            let match;
            while ((match = CategoryDiagnosticProvider.CATEGORY_REFERENCE_PATTERN.exec(lineText)) !== null) {
                const categoryId = match[0];
                const startCol = match.index;

                // 检查是否在注释中
                if (YamlHelper.isInComment(lineText, startCol)) {
                    continue;
                }

                // 基于 Schema 检查此位置是否期望分类引用
                const position = new Position(lineNum, startCol);
                const isCategoryField = await this.fieldIdentifier.isFieldOfType(
                    document,
                    position,
                    CategoryDiagnosticProvider.CATEGORY_REFERENCE_PROVIDER,
                );

                if (!isCategoryField) {
                    continue;
                }

                references.push({
                    id: categoryId,
                    range: new Range(lineNum, startCol, lineNum, startCol + categoryId.length),
                    line: lineNum,
                });
            }
        }

        return references;
    }

    /**
     * 验证分类引用
     */
    private async validateICategoryReference(ref: ICategoryReference, document: TextDocument): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];

        try {
            // 检查分类是否存在
            const category = await this.dataStoreService.getCategoryById(ref.id);

            if (!category) {
                const diagnostic = this.createDiagnostic(
                    ref.range,
                    REFERENCE_MESSAGES.categoryNotFound(ref.id),
                    CATEGORY_NOT_FOUND,
                );

                if (diagnostic) {
                    // 添加相似分类建议
                    const allCategories = await this.dataStoreService.getAllCategories();
                    diagnostic.relatedInformation = this.createSimilaritySuggestions(
                        ref.id,
                        allCategories.map((c) => c.id),
                        document,
                        ref.range,
                        'Did you mean category:',
                    );
                    diagnostics.push(diagnostic);
                }
            }
        } catch (error) {
            this.logger.error('Error validating category reference', error as Error, {
                categoryId: ref.id,
            });
        }

        return diagnostics;
    }
}
