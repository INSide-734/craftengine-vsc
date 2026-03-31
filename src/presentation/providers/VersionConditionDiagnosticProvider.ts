import { type TextDocument, type Diagnostic, Range } from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { type IMinecraftVersionService } from '../../core/interfaces/IMinecraftVersionService';
import { type IDataConfigLoader } from '../../core/interfaces/IDataConfigLoader';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { YamlHelper } from '../../infrastructure/yaml/YamlHelper';
import {
    INVALID_VERSION_CONDITION,
    VERSION_TOO_OLD,
    VERSION_NOT_FOUND,
    INVALID_VERSION_RANGE,
} from '../../core/constants/DiagnosticCodes';
import { TYPE_VALIDATION_MESSAGES } from '../../core/constants/DiagnosticMessages';
import { BaseDiagnosticProvider } from './BaseDiagnosticProvider';

/**
 * 版本条件引用信息
 */
interface IVersionConditionReference {
    /** 完整的版本条件字符串 */
    condition: string;
    /** 操作符 (>=, <, <=, =, 或空表示范围) */
    operator: string;
    /** 版本号（单版本或起始版本） */
    version: string;
    /** 结束版本（范围模式） */
    endVersion?: string;
    /** 引用范围 */
    range: Range;
    /** 所在行号 */
    line: number;
}

/**
 * 版本条件诊断提供者
 *
 * 检测配置文件中无效的版本条件格式和版本号
 *
 * ## 诊断规则
 *
 * 1. **格式错误** (`invalid_version_format`): 版本条件格式不正确
 * 2. **无效版本** (`unknown_version`): 版本号不存在于 Minecraft 版本列表
 * 3. **范围错误** (`invalid_version_range`): 版本范围中起始版本大于结束版本
 * 4. **版本过低** (`version_too_old`): 版本低于 CraftEngine 支持的最低版本 (1.20.1)
 */
export class VersionConditionDiagnosticProvider extends BaseDiagnosticProvider {
    private readonly versionService: IMinecraftVersionService;

    /** 诊断源标识 */
    static readonly DIAGNOSTIC_SOURCE = 'CraftEngine VersionCondition';

    /** 版本条件正则表达式 */
    private static readonly VERSION_CONDITION_PATTERN = /\$\$(>=|<=|<|=)?(\d+\.\d+(?:\.\d+)?)(~(\d+\.\d+(?:\.\d+)?))?/g;

    /** 支持的最低版本（默认值，可从配置覆盖） */
    private readonly minSupportedVersion: string;

    constructor() {
        super(
            'craftengine-versioncondition',
            'CraftEngine VersionCondition',
            'versionCondition.diagnostics.update',
            'VersionConditionDiagnosticProvider',
        );
        this.versionService = ServiceContainer.getService<IMinecraftVersionService>(
            SERVICE_TOKENS.MinecraftVersionService,
        );
        // 从版本要求配置读取最低支持版本
        const configLoader = ServiceContainer.getService<IDataConfigLoader>(SERVICE_TOKENS.DataConfigLoader);
        const versionReqConfig = configLoader.getVersionRequirementsConfigSync();
        this.minSupportedVersion = versionReqConfig?.minecraft?.minSupportedStrict ?? '1.20.1';
    }

    /**
     * 执行版本条件诊断
     */
    protected async doUpdateDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];

        // 查找所有版本条件引用
        const references = this.findIVersionConditionReferences(document);

        // 验证每个引用
        for (const ref of references) {
            const refDiagnostics = await this.validateVersionCondition(ref);
            diagnostics.push(...refDiagnostics);
        }

        return diagnostics;
    }

    /**
     * 查找文档中的版本条件引用
     */
    private findIVersionConditionReferences(document: TextDocument): IVersionConditionReference[] {
        const references: IVersionConditionReference[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const lineText = lines[lineNum];

            // 跳过注释行
            if (YamlHelper.isPureCommentLine(lineText)) {
                continue;
            }

            // 查找行中的版本条件
            const pattern = new RegExp(VersionConditionDiagnosticProvider.VERSION_CONDITION_PATTERN.source, 'g');
            let match;

            while ((match = pattern.exec(lineText)) !== null) {
                const condition = match[0];
                const startCol = match.index;
                const endCol = startCol + condition.length;

                // 检查是否在注释中
                if (YamlHelper.isInComment(lineText, startCol)) {
                    continue;
                }

                references.push({
                    condition,
                    operator: match[1] || '',
                    version: match[2],
                    endVersion: match[4],
                    range: new Range(lineNum, startCol, lineNum, endCol),
                    line: lineNum,
                });
            }
        }

        return references;
    }

    /**
     * 验证版本条件
     */
    private async validateVersionCondition(ref: IVersionConditionReference): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];

        try {
            // 验证起始/单一版本
            const versionDiagnostic = await this.validateVersion(ref.version, ref.range);
            if (versionDiagnostic) {
                diagnostics.push(versionDiagnostic);
            }

            // 验证结束版本（范围模式）
            if (ref.endVersion) {
                const endVersionDiagnostic = await this.validateVersion(ref.endVersion, ref.range);
                if (endVersionDiagnostic) {
                    diagnostics.push(endVersionDiagnostic);
                }

                // 验证范围有效性
                const rangeDiagnostic = this.validateVersionRange(ref);
                if (rangeDiagnostic) {
                    diagnostics.push(rangeDiagnostic);
                }
            }
        } catch (error) {
            this.logger.debug('Error validating version condition', {
                condition: ref.condition,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        return diagnostics;
    }

    /**
     * 验证单个版本号
     */
    private async validateVersion(version: string, range: Range): Promise<Diagnostic | null> {
        // 检查版本格式
        if (!this.versionService.isValidVersionFormat(version)) {
            return this.createDiagnostic(
                range,
                TYPE_VALIDATION_MESSAGES.invalidVersionCondition(version, 'Expected format: X.Y or X.Y.Z'),
                INVALID_VERSION_CONDITION,
            );
        }

        // 检查版本是否过低
        if (this.versionService.compareVersions(version, this.minSupportedVersion) < 0) {
            return this.createDiagnostic(
                range,
                TYPE_VALIDATION_MESSAGES.versionTooOld(version, this.minSupportedVersion),
                VERSION_TOO_OLD,
            );
        }

        // 检查版本是否存在
        const isValid = await this.versionService.isValidVersion(version);
        if (!isValid) {
            return this.createDiagnostic(range, TYPE_VALIDATION_MESSAGES.versionNotFound(version), VERSION_NOT_FOUND);
        }

        return null;
    }

    /**
     * 验证版本范围有效性
     */
    private validateVersionRange(ref: IVersionConditionReference): Diagnostic | null {
        if (!ref.endVersion) {
            return null;
        }

        const comparison = this.versionService.compareVersions(ref.version, ref.endVersion);

        if (comparison >= 0) {
            return this.createDiagnostic(
                ref.range,
                TYPE_VALIDATION_MESSAGES.invalidVersionRange(ref.version, ref.endVersion),
                INVALID_VERSION_RANGE,
            );
        }

        return null;
    }
}
