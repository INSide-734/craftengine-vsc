import { type TextDocument, type Diagnostic, Range, languages, DiagnosticRelatedInformation, Location } from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type IEventBus } from '../../core/interfaces/IEventBus';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { MiniMessageDataLoader } from '../../infrastructure/schema/data-loaders';
import { generateEventId } from '../../infrastructure/utils';
import { BaseDiagnosticProvider } from './BaseDiagnosticProvider';
import { MiniMessageParser, type MiniMessageValidationError } from '../../domain/services/minimessage';

/**
 * MiniMessage 诊断提供者
 *
 * 检测 MiniMessage 格式文本中的错误和警告。
 * 解析和验证逻辑委托给 Domain 层的 MiniMessageParser。
 */
export class MiniMessageDiagnosticProvider extends BaseDiagnosticProvider {
    private readonly eventBus: IEventBus;
    private readonly parser: MiniMessageParser;

    private static readonly MINIMESSAGE_FIELD_PATTERN = /<[a-z!#]/i;

    constructor() {
        super(
            'craftengine-minimessage',
            'CraftEngine MiniMessage',
            'minimessage-diagnostics.update',
            'MiniMessageDiagnosticProvider',
        );
        this.eventBus = ServiceContainer.getService<IEventBus>(SERVICE_TOKENS.EventBus);
        this.parser = new MiniMessageParser(MiniMessageDataLoader.getInstance());
    }

    /**
     * MiniMessage 诊断逻辑
     */
    protected async doUpdateDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
        // 确保 MiniMessage 数据已加载
        await MiniMessageDataLoader.getInstance().ensureLoaded();

        const diagnostics: Diagnostic[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // 逐行检查 MiniMessage 内容
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];

            if (MiniMessageDiagnosticProvider.MINIMESSAGE_FIELD_PATTERN.test(line)) {
                const result = this.parser.validateLine(line, lineNum);
                for (const error of result.errors) {
                    const diagnostic = this.convertToDiagnostic(error, document);
                    if (diagnostic) {
                        diagnostics.push(diagnostic);
                    }
                }
            }
        }

        // 合并到现有诊断而不是替换
        const existingDiagnostics = [...(languages.getDiagnostics(document.uri) || [])];
        const otherDiagnostics = existingDiagnostics.filter((d) => !d.source?.includes('MiniMessage'));

        // 发布诊断更新事件
        await this.eventBus.publish('minimessage.diagnostics.updated', {
            id: generateEventId('minimessage-diag'),
            type: 'minimessage.diagnostics.updated',
            timestamp: new Date(),
            source: 'MiniMessageDiagnosticProvider',
            uri: document.uri,
            diagnosticCount: diagnostics.length,
        });

        return [...otherDiagnostics, ...diagnostics];
    }

    /**
     * 将领域层验证错误转换为 VS Code Diagnostic
     */
    private convertToDiagnostic(error: MiniMessageValidationError, document: TextDocument): Diagnostic | null {
        const range = new Range(error.startLine, error.startCharacter, error.endLine, error.endCharacter);

        const diagnostic = this.createDiagnostic(range, error.message, error.codeInfo);
        if (!diagnostic) {
            return null;
        }

        // 添加关联信息
        if (error.relatedInfo && error.relatedInfo.length > 0) {
            diagnostic.relatedInformation = error.relatedInfo.map(
                (info) =>
                    new DiagnosticRelatedInformation(
                        new Location(
                            document.uri,
                            new Range(info.startLine, info.startCharacter, info.endLine, info.endCharacter),
                        ),
                        info.message,
                    ),
            );
        }

        return diagnostic;
    }
}
