import { type TextDocument, type Position } from 'vscode';
import { type ISchemaService } from '../../../core/interfaces/ISchemaService';
import { type IYamlPathParser } from '../../../core/interfaces/IYamlPathParser';

/**
 * Schema 字段类型识别器
 *
 * 封装基于 Schema x-completion-provider 属性判断字段类型的公共逻辑。
 * 被 Category、ItemId、Translation、FilePath、Template 等诊断提供者共用。
 */
export class SchemaFieldIdentifier {
    constructor(
        private readonly schemaService: ISchemaService,
        private readonly yamlPathParser: IYamlPathParser,
    ) {}

    /**
     * 检查指定位置的字段是否匹配某个 x-completion-provider
     *
     * @param document 文档
     * @param position 位置
     * @param providerId 期望的 completion-provider 标识（如 'craftengine.categoryReference'）
     * @returns 是否匹配
     */
    async isFieldOfType(document: TextDocument, position: Position, providerId: string): Promise<boolean> {
        try {
            const path = this.yamlPathParser.parsePath(document, position);
            if (path.length === 0) {
                return false;
            }

            const schema = await this.schemaService.getSchemaForPath(path);
            if (!schema) {
                return false;
            }

            const completionProvider = this.schemaService.getCustomProperty(schema, 'completion-provider');
            return completionProvider === providerId;
        } catch {
            return false;
        }
    }
}
