import { type TextDocument, type Diagnostic, Range, Position } from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { type ISchemaService } from '../../core/interfaces/ISchemaService';
import { type IYamlPathParser } from '../../core/interfaces/IYamlPathParser';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { YamlHelper } from '../../infrastructure/yaml/YamlHelper';
import { ITEM_NOT_FOUND } from '../../core/constants/DiagnosticCodes';
import { TYPE_VALIDATION_MESSAGES } from '../../core/constants/DiagnosticMessages';
import { BaseDiagnosticProvider } from './BaseDiagnosticProvider';
import { SchemaFieldIdentifier } from './helpers/SchemaFieldIdentifier';

/** 物品 ID 引用信息 */
interface ItemIdReference {
    id: string;
    range: Range;
    line: number;
}

/** 命名空间 ID 正则表达式 */
const NAMESPACED_ID_PATTERN = /[a-z][a-z0-9_-]*:[a-z][a-z0-9_/-]*/g;

/**
 * 物品 ID 诊断提供者
 *
 * 检测配置文件中无效的物品 ID 引用
 */
export class ItemIdDiagnosticProvider extends BaseDiagnosticProvider {
    private readonly dataStoreService: IDataStoreService;
    private readonly fieldIdentifier: SchemaFieldIdentifier;

    static readonly DIAGNOSTIC_SOURCE = 'CraftEngine ItemId';
    private static readonly ITEM_ID_PROVIDER = 'craftengine.itemId';

    constructor() {
        super('craftengine-itemid', 'CraftEngine ItemId', 'itemId.diagnostics.update', 'ItemIdDiagnosticProvider');
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(SERVICE_TOKENS.DataStoreService);
        const schemaService = ServiceContainer.getService<ISchemaService>(SERVICE_TOKENS.SchemaService);
        const yamlPathParser = ServiceContainer.getService<IYamlPathParser>(SERVICE_TOKENS.YamlPathParser);
        this.fieldIdentifier = new SchemaFieldIdentifier(schemaService, yamlPathParser);
    }

    /**
     * 执行物品 ID 诊断
     */
    protected async doUpdateDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
        const references = await this.findItemIdReferences(document);
        if (references.length === 0) {
            return [];
        }

        // 并行验证所有引用
        const results = await Promise.all(references.map((ref) => this.validateReference(ref, document)));
        return results.filter((d): d is Diagnostic => d !== null);
    }

    private async findItemIdReferences(document: TextDocument): Promise<ItemIdReference[]> {
        const references: ItemIdReference[] = [];
        const lines = document.getText().split('\n');

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const lineText = lines[lineNum];

            if (YamlHelper.isPureCommentLine(lineText)) {
                continue;
            }

            const pattern = new RegExp(NAMESPACED_ID_PATTERN.source, 'g');
            let match;

            while ((match = pattern.exec(lineText)) !== null) {
                if (YamlHelper.isInComment(lineText, match.index)) {
                    continue;
                }

                const position = new Position(lineNum, match.index);
                if (
                    await this.fieldIdentifier.isFieldOfType(
                        document,
                        position,
                        ItemIdDiagnosticProvider.ITEM_ID_PROVIDER,
                    )
                ) {
                    references.push({
                        id: match[0],
                        range: new Range(lineNum, match.index, lineNum, match.index + match[0].length),
                        line: lineNum,
                    });
                }
            }
        }

        return references;
    }

    private async validateReference(ref: ItemIdReference, document: TextDocument): Promise<Diagnostic | null> {
        try {
            const item = await this.dataStoreService.getItemById(ref.id);
            if (item) {
                return null;
            }

            // 检查是否在当前文件中定义
            if (this.isDefinedInCurrentFile(ref.id, document)) {
                return null;
            }

            return this.createDiagnostic(ref.range, TYPE_VALIDATION_MESSAGES.itemNotFound(ref.id), ITEM_NOT_FOUND);
        } catch (error) {
            this.logger.debug('Error validating item ID', { itemId: ref.id, error: (error as Error).message });
            return null;
        }
    }

    private isDefinedInCurrentFile(itemId: string, document: TextDocument): boolean {
        const escapedId = itemId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^\\s*${escapedId}\\s*:`, 'm');
        return pattern.test(document.getText());
    }
}
