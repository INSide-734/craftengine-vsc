/**
 * 诊断提供者辅助模块
 *
 * 提供 YAML 位置映射、诊断范围处理、模板引用查找、
 * 模板参数验证和扩展类型验证功能
 */

export { YamlPositionMapper, IPositionInfo } from './YamlPositionMapper';
export { DiagnosticRangeHelper, extractTextFromRange } from './DiagnosticRangeHelper';
export { extractDiagnosticCode, isDiagnosticCode } from './DiagnosticCodeHelper';
export { SchemaFieldIdentifier } from './SchemaFieldIdentifier';
export { SchemaPositionResolver } from './SchemaPositionResolver';
export { SchemaDiagnosticFormatter } from './SchemaDiagnosticFormatter';
export { ExtendedTypeValidator } from './ExtendedTypeValidator';
export type { ExtendedTypeUsage } from './ExtendedTypeValidator';
export { TemplateReferenceFinder } from './TemplateReferenceFinder';
export type { TemplateUsage } from './TemplateReferenceFinder';
export { TemplateParameterValidator } from './TemplateParameterValidator';
export { getExampleValue, buildTemplateMarkdown } from './TemplateDocumentationBuilder';
