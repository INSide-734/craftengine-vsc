import { type TextDocument, CodeAction, CodeActionKind, WorkspaceEdit, type Diagnostic } from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type IMinecraftVersionService } from '../../core/interfaces/IMinecraftVersionService';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { VersionConditionDiagnosticProvider } from './VersionConditionDiagnosticProvider';
import { BaseCodeActionProvider } from './BaseCodeActionProvider';
import {
    VERSION_NOT_FOUND,
    INVALID_VERSION_CONDITION,
    VERSION_TOO_OLD,
    INVALID_VERSION_RANGE,
} from '../../core/constants/DiagnosticCodes';
import { extractDiagnosticCode } from './helpers';

/**
 * 版本条件代码操作提供者
 *
 * 为版本条件相关的诊断错误提供快速修复建议
 */
export class VersionConditionCodeActionProvider extends BaseCodeActionProvider {
    private readonly versionService: IMinecraftVersionService;

    /** 提供的 CodeAction 类型 */
    static readonly providedCodeActionKinds = [CodeActionKind.QuickFix];

    protected readonly diagnosticSource = VersionConditionDiagnosticProvider.DIAGNOSTIC_SOURCE;

    constructor() {
        super('VersionConditionCodeActionProvider');
        this.versionService = ServiceContainer.getService<IMinecraftVersionService>(
            SERVICE_TOKENS.MinecraftVersionService,
        );
    }

    /**
     * 为诊断创建修复操作
     */
    protected async createFixActions(document: TextDocument, diagnostic: Diagnostic): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];

        // 提取诊断代码值
        const codeValue = extractDiagnosticCode(diagnostic);

        switch (codeValue) {
            case VERSION_NOT_FOUND.code:
                actions.push(...(await this.createUnknownVersionActions(document, diagnostic)));
                break;

            case INVALID_VERSION_CONDITION.code:
                actions.push(...(await this.createInvalidFormatActions(document, diagnostic)));
                break;

            case VERSION_TOO_OLD.code:
                actions.push(...(await this.createVersionTooOldActions(document, diagnostic)));
                break;

            case INVALID_VERSION_RANGE.code:
                actions.push(...(await this.createInvalidRangeActions(document, diagnostic)));
                break;

            default:
                break;
        }

        return actions;
    }

    /**
     * 创建未知版本的修复操作
     */
    private async createUnknownVersionActions(document: TextDocument, diagnostic: Diagnostic): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];
        const conditionText = document.getText(diagnostic.range);

        // 解析版本条件
        const parsed = this.parseVersionCondition(conditionText);
        if (!parsed) {
            return actions;
        }

        // 获取建议的版本
        const suggestedVersions = await this.versionService.getSuggestedVersions(parsed.version);

        // 为每个建议版本创建替换操作
        for (const [index, version] of suggestedVersions.slice(0, 5).entries()) {
            const newCondition = this.buildVersionCondition(parsed.operator, version, parsed.endVersion);

            const action = new CodeAction(`Replace with '${newCondition}'`, CodeActionKind.QuickFix);

            action.diagnostics = [diagnostic];
            action.isPreferred = index === 0;

            const edit = new WorkspaceEdit();
            edit.replace(document.uri, diagnostic.range, newCondition);
            action.edit = edit;

            actions.push(action);
        }

        // 使用最新版本
        const latestVersion = await this.versionService.getLatestRelease();
        const latestCondition = this.buildVersionCondition(parsed.operator, latestVersion, parsed.endVersion);

        if (!suggestedVersions.includes(latestVersion)) {
            const latestAction = new CodeAction(`Use latest version '${latestCondition}'`, CodeActionKind.QuickFix);
            latestAction.diagnostics = [diagnostic];

            const edit = new WorkspaceEdit();
            edit.replace(document.uri, diagnostic.range, latestCondition);
            latestAction.edit = edit;

            actions.push(latestAction);
        }

        return actions;
    }

    /**
     * 创建格式错误的修复操作
     */
    private async createInvalidFormatActions(document: TextDocument, diagnostic: Diagnostic): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];

        // 获取最新版本列表
        const versions = await this.versionService.getVersions();
        const topVersions = versions.slice(0, 5);

        // 提供常用版本条件模板
        const templates = [
            { label: '$$>=', desc: 'Greater than or equal' },
            { label: '$$<', desc: 'Less than' },
            { label: '$$<=', desc: 'Less than or equal' },
        ];

        for (const template of templates) {
            for (const ver of topVersions.slice(0, 2)) {
                const condition = `${template.label}${ver.version}`;
                const action = new CodeAction(`Replace with '${condition}'`, CodeActionKind.QuickFix);
                action.diagnostics = [diagnostic];

                const edit = new WorkspaceEdit();
                edit.replace(document.uri, diagnostic.range, condition);
                action.edit = edit;

                actions.push(action);
            }
        }

        return actions;
    }

    /**
     * 创建版本过低的修复操作
     */
    private async createVersionTooOldActions(document: TextDocument, diagnostic: Diagnostic): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];
        const conditionText = document.getText(diagnostic.range);

        const parsed = this.parseVersionCondition(conditionText);
        if (!parsed) {
            return actions;
        }

        // 建议使用 1.20.1（最低支持版本）
        const minVersion = '1.20.1';
        const minCondition = this.buildVersionCondition(parsed.operator, minVersion, parsed.endVersion);

        const minAction = new CodeAction(
            `Replace with minimum supported version '${minCondition}'`,
            CodeActionKind.QuickFix,
        );
        minAction.diagnostics = [diagnostic];
        minAction.isPreferred = true;

        const minEdit = new WorkspaceEdit();
        minEdit.replace(document.uri, diagnostic.range, minCondition);
        minAction.edit = minEdit;

        actions.push(minAction);

        // 建议使用最新版本
        const latestVersion = await this.versionService.getLatestRelease();
        const latestCondition = this.buildVersionCondition(parsed.operator, latestVersion, parsed.endVersion);

        const latestAction = new CodeAction(
            `Replace with latest version '${latestCondition}'`,
            CodeActionKind.QuickFix,
        );
        latestAction.diagnostics = [diagnostic];

        const latestEdit = new WorkspaceEdit();
        latestEdit.replace(document.uri, diagnostic.range, latestCondition);
        latestAction.edit = latestEdit;

        actions.push(latestAction);

        return actions;
    }

    /**
     * 创建版本范围错误的修复操作
     */
    private async createInvalidRangeActions(document: TextDocument, diagnostic: Diagnostic): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];
        const conditionText = document.getText(diagnostic.range);

        const parsed = this.parseVersionCondition(conditionText);
        if (!parsed || !parsed.endVersion) {
            return actions;
        }

        // 交换起始和结束版本
        const swappedCondition = `$$${parsed.endVersion}~${parsed.version}`;

        const swapAction = new CodeAction(`Swap versions: '${swappedCondition}'`, CodeActionKind.QuickFix);
        swapAction.diagnostics = [diagnostic];
        swapAction.isPreferred = true;

        const swapEdit = new WorkspaceEdit();
        swapEdit.replace(document.uri, diagnostic.range, swappedCondition);
        swapAction.edit = swapEdit;

        actions.push(swapAction);

        // 转换为单版本条件
        const singleCondition = `$$>=${parsed.version}`;

        const singleAction = new CodeAction(`Convert to single version: '${singleCondition}'`, CodeActionKind.QuickFix);
        singleAction.diagnostics = [diagnostic];

        const singleEdit = new WorkspaceEdit();
        singleEdit.replace(document.uri, diagnostic.range, singleCondition);
        singleAction.edit = singleEdit;

        actions.push(singleAction);

        return actions;
    }

    /**
     * 解析版本条件
     */
    private parseVersionCondition(condition: string): {
        operator: string;
        version: string;
        endVersion?: string;
    } | null {
        const match = condition.match(/\$\$(>=|<=|<|=)?(\d+\.\d+(?:\.\d+)?)(~(\d+\.\d+(?:\.\d+)?))?/);
        if (!match) {
            return null;
        }

        return {
            operator: match[1] || '',
            version: match[2],
            endVersion: match[4],
        };
    }

    /**
     * 构建版本条件字符串
     */
    private buildVersionCondition(operator: string, version: string, endVersion?: string): string {
        if (endVersion) {
            return `$$${version}~${endVersion}`;
        }
        return `$$${operator}${version}`;
    }
}
