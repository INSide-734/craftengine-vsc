// src/features/SchemaProvider.ts
import * as vscode from 'vscode';
import { templateCache } from '../core/TemplateCache';

const SCHEMA_URI = 'craftengine://schema/templates';

/**
 * 动态生成反映当前所有模板及其参数的 JSON Schema
 * 
 * 根据模板缓存中的所有模板，生成一个动态的 JSON Schema 定义。
 * 该 Schema 使用 allOf/if-then 结构，为每个模板定义精确的参数校验规则。
 * 
 * @returns {string} JSON Schema 字符串，包含所有模板的验证规则
 * 
 * @example
 * // 生成的 Schema 结构：
 * // {
 * //   "allOf": [
 * //     {
 * //       "if": { "properties": { "template": { "const": "api" } } },
 * //       "then": { "properties": { "arguments": { "properties": { "url": {...} } } } }
 * //     }
 * //   ]
 * // }
 */
function generateDynamicSchema(): string {
    const allTemplates = templateCache.getAll();

    const schema = {
        // 使用 allOf/if-then 结构，为每个模板定义精确的 arguments 校验
        allOf: allTemplates.map(template => ({
            if: {
                properties: { template: { const: template.name } },
                required: ['template']
            },
            then: {
                properties: {
                    arguments: {
                        type: 'object',
                        // 定义所有已知参数
                        properties: Object.fromEntries(
                            template.parameters.map(p => [p, { description: `Parameter for '${template.name}'` }])
                        ),
                        // 关键：不允许出现模板中未定义的参数
                        additionalProperties: false,
                        // 可选：将所有参数设为必需
                        // required: template.parameters
                    }
                }
            }
        }))
    };

    return JSON.stringify(schema);
}

/**
 * 注册 Schema Provider，将其提供给 Red Hat YAML 扩展
 * 
 * 尝试多种方式注册 Schema Provider，以确保与不同版本的 Red Hat YAML 扩展兼容。
 * 支持以下注册方法：
 * 1. registerSchemaRequestProvider (旧版本)
 * 2. registerSchemaProvider (新版本)
 * 3. registerSchemaContributor (另一种可能的 API)
 * 4. registerContributor (最通用的方法)
 * 
 * @param {vscode.ExtensionContext} context - VS Code 扩展上下文，用于管理资源订阅
 * @returns {Promise<void>} 注册过程的异步操作
 * 
 * @example
 * // 在扩展激活时调用：
 * // await registerSchemaProvider(context);
 */
export async function registerSchemaProvider(context: vscode.ExtensionContext) {
    try {
        // 1. 获取 Red Hat YAML 扩展的 API
        const yamlExtension = vscode.extensions.getExtension('redhat.vscode-yaml');
        if (!yamlExtension) {
            // 显示用户友好的通知
            vscode.window.showInformationMessage(
                'CraftEngine: Schema validation requires Red Hat YAML extension. Click to install for complete YAML validation support.',
                'Install Red Hat YAML Extension'
            ).then(selection => {
                if (selection === 'Install Red Hat YAML Extension') {
                    vscode.commands.executeCommand('workbench.extensions.install', 'redhat.vscode-yaml');
                }
            });
            console.warn('Red Hat YAML extension not found. Schema validation will be disabled.');
            return;
        }

        // 必须在 YAML 扩展激活后才能获取 API
        const yamlApi = await yamlExtension.activate();

        // 2. 检查 API 是否可用
        if (!yamlApi || typeof yamlApi !== 'object') {
            vscode.window.showWarningMessage(
                'CraftEngine: Red Hat YAML extension is installed but API is not available. Schema validation will be disabled.'
            );
            console.warn('YAML extension API not available. Schema validation will be disabled.');
            return;
        }

        // 3. 使用更兼容的方法注册 schema
        let registrations: vscode.Disposable[] = [];

        // 方法1: 尝试使用 registerSchemaRequestProvider (旧版本)
        if (typeof yamlApi.registerSchemaRequestProvider === 'function') {
            const providerRegistration = yamlApi.registerSchemaRequestProvider((resource: string) => {
                if (resource === SCHEMA_URI) {
                    return generateDynamicSchema();
                }
                return undefined;
            });
            registrations.push(providerRegistration);
        }
        // 方法2: 尝试使用 registerSchemaProvider (新版本)
        else if (typeof yamlApi.registerSchemaProvider === 'function') {
            const providerRegistration = yamlApi.registerSchemaProvider(SCHEMA_URI, {
                provideSchema: () => {
                    return {
                        schema: generateDynamicSchema(),
                        uri: SCHEMA_URI
                    };
                }
            });
            registrations.push(providerRegistration);
        }
        // 方法3: 尝试使用 registerSchemaContributor (另一种可能的 API)
        else if (typeof yamlApi.registerSchemaContributor === 'function') {
            const contributorRegistration = yamlApi.registerSchemaContributor(
                'craftengine-helper',
                (resource: string) => {
                    if (resource.endsWith('.yaml') || resource.endsWith('.yml')) {
                        return SCHEMA_URI;
                    }
                    return undefined;
                }
            );
            registrations.push(contributorRegistration);
        }
        // 方法4: 尝试使用 registerContributor (最通用的方法)
        else if (typeof yamlApi.registerContributor === 'function') {
            const contributorRegistration = yamlApi.registerContributor(
                'craftengine-helper',
                (_resourceUri: string) => {
                    return SCHEMA_URI;
                }
            );
            registrations.push(contributorRegistration);
        }
        else {
            vscode.window.showWarningMessage(
                'CraftEngine: No compatible Schema Provider API found. Please ensure Red Hat YAML extension version is compatible.'
            );
            console.warn('No compatible schema provider API found in YAML extension.');
            return;
        }

        // 4. 将所有注册的资源添加到扩展的订阅中
        registrations.forEach(registration => {
            context.subscriptions.push(registration);
        });

        console.log('Schema provider registered successfully.');
        vscode.window.showInformationMessage('CraftEngine: Schema validation is now enabled!');
    } catch (error) {
        vscode.window.showErrorMessage(
            'CraftEngine: Schema validation registration failed, but other features will continue to work normally.'
        );
        console.error('Failed to register schema provider:', error);
        // 不抛出错误，让扩展继续工作
    }
}