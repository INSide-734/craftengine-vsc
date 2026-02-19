/**
 * 全局测试初始化
 *
 * 在所有测试运行前初始化配置驱动的常量模块。
 * 通过 vitest.config.ts 的 setupFiles 引入。
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeSchemaConfig } from '../core/constants/SchemaConstants';
import { initializeDiagnosticCodes } from '../core/constants/DiagnosticCodes';
import { initializeDiagnosticSeverityRules } from '../core/constants/DiagnosticSeverityRules';
import { initializeMinecraftVersions } from '../domain/services/model/utils/MinecraftVersion';
import { initializeModelProperties } from '../domain/services/model/ModelPropertiesInit';
import { initializeMiniMessagePatterns } from '../presentation/strategies/delegates/richtext/types';
import { initializeTypeDisplayNames } from '../core/constants/DiagnosticMessages';
import { IMiniMessageConstantsConfig, IDiagnosticCodesConfig } from '../core/types/ConfigTypes';

/**
 * 从 data/ 目录加载 JSON 配置文件
 */
function loadJsonConfig<T>(relativePath: string): T {
    const fullPath = resolve(__dirname, '../../data', relativePath);
    return JSON.parse(readFileSync(fullPath, 'utf-8')) as T;
}

// 初始化所有配置驱动的常量模块
initializeSchemaConfig(loadJsonConfig('constants/schema-config.json'));
const diagnosticCodesConfig = loadJsonConfig<IDiagnosticCodesConfig>('constants/diagnostic-codes.json');
initializeDiagnosticCodes(diagnosticCodesConfig);
if (diagnosticCodesConfig.typeDisplayNames) {
    initializeTypeDisplayNames(diagnosticCodesConfig.typeDisplayNames);
}
initializeDiagnosticSeverityRules(loadJsonConfig('constants/diagnostic-severity-rules.json'));
initializeMinecraftVersions(loadJsonConfig('minecraft/versions.json'));
initializeModelProperties(loadJsonConfig('minecraft/model-properties.json'));

const miniMessageConfig = loadJsonConfig<IMiniMessageConstantsConfig>('schema/minimessage-constants.json');
initializeMiniMessagePatterns(miniMessageConfig.patterns, miniMessageConfig.commonLanguages);
