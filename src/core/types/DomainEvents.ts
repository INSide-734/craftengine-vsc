import { type EditorUri } from './EditorTypes';
import { type ITemplate } from '../interfaces/ITemplate';
import { type IItemId } from '../interfaces/IItemId';
import { type ICategory } from '../interfaces/ICategory';
import { type ITranslationKey } from '../interfaces/ITranslation';

/**
 * 基础领域事件接口
 *
 * 所有领域事件的基础接口，定义了事件的通用属性。
 * 领域事件用于在系统中传播重要的业务状态变更。
 *
 * @remarks
 * **领域事件设计原则**：
 *
 * 1. **不可变性**：事件一旦创建就不应该被修改
 * 2. **过去式命名**：事件名使用过去式，表示已发生的事实
 * 3. **完整信息**：事件应包含足够的信息，订阅者无需查询即可处理
 * 4. **业务语言**：使用领域通用语言（Ubiquitous Language）
 *
 * **事件属性说明**：
 *
 * - **id**: 事件的唯一标识符，用于追踪和去重
 * - **type**: 事件类型，使用点号分隔的命名空间格式
 * - **timestamp**: 事件发生的时间戳
 * - **source**: 事件来源，标识哪个组件发布了事件
 * - **aggregateId**: 聚合根ID，标识事件关联的聚合根实体
 * - **version**: 事件版本号，用于处理事件演化和兼容性
 *
 * **使用场景**：
 *
 * - 模块间解耦通信
 * - 审计日志记录
 * - 缓存失效通知
 * - 状态变更广播
 * - 事件溯源（Event Sourcing）
 *
 * @example
 * ```typescript
 * // 创建自定义领域事件
 * export interface UserRegistered extends IDomainEvent {
 *     type: 'user.registered';
 *     userId: string;
 *     email: string;
 * }
 *
 * // 发布事件
 * await eventBus.publish('user.registered', {
 *     id: generateId(),
 *     type: 'user.registered',
 *     timestamp: new Date(),
 *     source: 'UserService',
 *     aggregateId: user.id,
 *     version: 1,
 *     userId: user.id,
 *     email: user.email
 * });
 * ```
 */
export interface IDomainEvent {
    /**
     * 事件ID - 唯一标识此事件实例
     *
     * @remarks
     * 通常使用 UUID 或其他全局唯一标识符生成算法。
     * 用于事件追踪、去重和幂等性处理。
     */
    id: string;

    /**
     * 事件类型 - 标识事件的类别
     *
     * @remarks
     * 使用点号分隔的命名空间格式，例如：
     * - `template.created`
     * - `template.updated`
     * - `extension.activated`
     */
    type: string;

    /**
     * 时间戳 - 事件发生的准确时间
     *
     * @remarks
     * 用于事件排序、时间线追踪和统计分析。
     */
    timestamp: Date;

    /**
     * 事件源 - 发布事件的组件或服务名称
     *
     * @remarks
     * 帮助追踪事件来源，便于调试和问题定位。
     * 例如：`TemplateService`, `ExtensionService`
     */
    source: string;

    /**
     * 聚合根ID - 关联的聚合根实体标识符（可选）
     *
     * @remarks
     * 在领域驱动设计中，标识事件所属的聚合根。
     * 例如模板ID、用户ID等。
     */
    aggregateId?: string;

    /**
     * 版本号 - 事件版本，用于处理事件演化（可选）
     *
     * @remarks
     * 随着系统演进，事件结构可能变化，版本号用于：
     * - 向后兼容性处理
     * - 事件升级和迁移
     * - 乐观锁控制
     */
    version?: number;
}

/**
 * 模板相关事件命名空间
 *
 * 包含所有与模板生命周期相关的领域事件定义。
 *
 * @remarks
 * **事件类型**：
 *
 * 1. **TemplateCreated**: 新模板创建事件
 * 2. **TemplateUpdated**: 模板更新事件
 * 3. **TemplateDeleted**: 模板删除事件
 * 4. **CacheRebuilt**: 模板缓存重建事件
 *
 * **订阅模式**：
 *
 * ```typescript
 * // 订阅特定事件
 * eventBus.subscribe('template.created', handler);
 *
 * // 订阅所有模板事件
 * eventBus.subscribe('template.*', handler);
 * ```
 *
 * @example
 * ```typescript
 * import { TemplateEvents } from './core/types/DomainEvents';
 *
 * // 发布模板创建事件
 * const event: TemplateEvents.TemplateCreated = {
 *     id: generateId(),
 *     type: 'template.created',
 *     timestamp: new Date(),
 *     source: 'TemplateService',
 *     aggregateId: template.id,
 *     template: template
 * };
 * await eventBus.publish('template.created', event);
 *
 * // 订阅模板事件
 * eventBus.subscribe('template.created', (event: TemplateEvents.TemplateCreated) => {
 *     console.log(`New template: ${event.template.name}`);
 *     // 更新 UI、缓存等
 * });
 * ```
 */
export namespace TemplateEvents {
    /**
     * 模板已创建事件
     *
     * 当新模板成功添加到系统中时发布。
     *
     * @remarks
     * **触发时机**：
     * - 模板解析完成并通过验证
     * - 模板成功保存到仓储
     * - 在事务提交之后发布
     *
     * **订阅者**：
     * - 补全系统（更新补全列表）
     * - Schema 生成器（更新动态 Schema）
     * - 缓存管理器（缓存新模板）
     * - 日志记录器（审计日志）
     */
    export interface TemplateCreated extends IDomainEvent {
        /** 事件类型固定为 'template.created' */
        type: 'template.created';
        /** 新创建的模板实体 */
        template: ITemplate;
    }

    /**
     * 模板已更新事件
     *
     * 当现有模板被修改时发布。
     *
     * @remarks
     * **触发时机**：
     * - 模板内容发生变更
     * - 模板元数据更新
     * - 模板重新验证通过
     *
     * **订阅者**：
     * - 补全系统（更新补全信息）
     * - 缓存管理器（失效旧缓存）
     * - 变更追踪器（记录变更历史）
     * - UI 组件（刷新显示）
     *
     * **注意**：
     * - previousVersion 可能为 undefined（如果没有保留历史版本）
     * - 订阅者应该能够处理部分更新
     */
    export interface TemplateUpdated extends IDomainEvent {
        /** 事件类型固定为 'template.updated' */
        type: 'template.updated';
        /** 更新后的模板实体 */
        template: ITemplate;
        /** 更新前的模板版本（可选），用于对比变更 */
        previousVersion?: ITemplate;
    }

    /**
     * 模板已删除事件
     *
     * 当模板从系统中移除时发布。
     *
     * @remarks
     * **触发时机**：
     * - 模板文件被删除
     * - 模板被手动移除
     * - 模板验证失败被清理
     *
     * **订阅者**：
     * - 补全系统（移除补全项）
     * - 缓存管理器（清理缓存）
     * - 引用检查器（检查依赖）
     * - 清理任务（删除相关资源）
     *
     * **注意**：
     * - 事件只包含模板标识信息，不包含完整模板实体
     * - 订阅者应该在事件发布前缓存必要的模板信息
     */
    export interface TemplateDeleted extends IDomainEvent {
        /** 事件类型固定为 'template.deleted' */
        type: 'template.deleted';
        /** 被删除模板的唯一标识符 */
        templateId: string;
        /** 被删除模板的名称，用于日志和通知 */
        templateName: string;
    }

    /**
     * 模板缓存已重建事件
     *
     * 当模板缓存完成重建时发布，通常在批量操作或初始化后。
     *
     * @remarks
     * **触发时机**：
     * - 扩展激活时初始加载所有模板
     * - 工作区文件变更后批量重新加载
     * - 手动触发缓存刷新
     *
     * **订阅者**：
     * - Schema 服务（重新生成 Schema）
     * - 性能监控（记录重建耗时）
     * - 状态栏组件（更新模板计数）
     * - 通知服务（显示完成消息）
     *
     * **性能指标**：
     * - templateCount: 加载的模板总数
     * - duration: 重建耗时（毫秒）
     */
    export interface CacheRebuilt extends IDomainEvent {
        /** 事件类型固定为 'template.cache.rebuilt' */
        type: 'template.cache.rebuilt';
        /** 重建后的模板总数 */
        templateCount: number;
        /** 重建耗时（毫秒） */
        duration: number;
    }
}

/**
 * 文件相关事件命名空间
 *
 * 包含所有与文件系统操作相关的领域事件定义。
 *
 * @remarks
 * **事件类型**：
 *
 * 1. **FileCreated**: 文件创建事件
 * 2. **FileModified**: 文件修改事件
 * 3. **FileDeleted**: 文件删除事件
 *
 * **文件监控**：
 *
 * 这些事件由 FileWatcher 服务发布，监控工作区中的 YAML 文件变更。
 * 主要用于：
 * - 触发模板重新解析
 * - 更新缓存
 * - 同步 Schema
 * - 通知相关组件
 *
 * @example
 * ```typescript
 * import { FileEvents } from './core/types/DomainEvents';
 *
 * // 订阅文件修改事件
 * eventBus.subscribe('file.modified', (event: FileEvents.FileModified) => {
 *     console.log(`File modified: ${event.uri.fsPath}`);
 *     console.log(`Affected templates: ${event.templatesAffected.join(', ')}`);
 *
 *     // 重新加载受影响的模板
 *     for (const templateName of event.templatesAffected) {
 *         await templateService.reloadTemplate(templateName);
 *     }
 * });
 * ```
 */
export namespace FileEvents {
    /**
     * 文件已创建事件
     *
     * 当工作区中创建新文件时发布。
     *
     * @remarks
     * **触发时机**：
     * - 用户在工作区创建新的 YAML 文件
     * - 文件从外部复制到工作区
     * - 版本控制系统检出新文件
     *
     * **订阅者**：
     * - YAML 扫描器（扫描新文件）
     * - 模板服务（解析新模板）
     * - 文件索引器（更新索引）
     */
    export interface FileCreated extends IDomainEvent {
        /** 事件类型固定为 'file.created' */
        type: 'file.created';
        /** 创建的文件 URI */
        uri: EditorUri;
    }

    /**
     * 文件已修改事件
     *
     * 当工作区中的文件内容发生变更时发布。
     *
     * @remarks
     * **触发时机**：
     * - 用户编辑并保存文件
     * - 外部工具修改文件
     * - 版本控制系统更新文件
     *
     * **订阅者**：
     * - 模板服务（重新解析模板）
     * - 缓存管理器（失效缓存）
     * - 诊断服务（重新验证）
     * - Schema 生成器（更新 Schema）
     *
     * **性能优化**：
     * - templatesAffected 列表帮助订阅者只处理相关模板
     * - 避免不必要的全量重新加载
     */
    export interface FileModified extends IDomainEvent {
        /** 事件类型固定为 'file.modified' */
        type: 'file.modified';
        /** 修改的文件 URI */
        uri: EditorUri;
        /** 受影响的模板名称列表 */
        templatesAffected: string[];
    }

    /**
     * 文件已删除事件
     *
     * 当工作区中的文件被删除时发布。
     *
     * @remarks
     * **触发时机**：
     * - 用户删除文件
     * - 文件被移动到其他位置
     * - 版本控制系统移除文件
     *
     * **订阅者**：
     * - 模板服务（移除相关模板）
     * - 缓存管理器（清理缓存）
     * - 引用检查器（检查断开的引用）
     * - 通知服务（警告用户）
     *
     * **注意事项**：
     * - templatesRemoved 列表包含所有在该文件中定义的模板
     * - 订阅者应该处理级联删除和引用清理
     */
    export interface FileDeleted extends IDomainEvent {
        /** 事件类型固定为 'file.deleted' */
        type: 'file.deleted';
        /** 删除的文件 URI */
        uri: EditorUri;
        /** 被移除的模板名称列表 */
        templatesRemoved: string[];
    }
}

/**
 * 扩展相关事件命名空间
 *
 * 包含所有与扩展生命周期和状态相关的领域事件定义。
 *
 * @remarks
 * **事件类型**：
 *
 * 1. **ExtensionActivated**: 扩展激活完成事件
 * 2. **ExtensionDeactivating**: 扩展即将停用事件
 * 3. **ConfigurationChanged**: 配置变更事件
 * 4. **PerformanceMetric**: 性能指标事件
 *
 * **用途**：
 *
 * - 协调扩展生命周期
 * - 传播配置变更
 * - 收集性能数据
 * - 健康状态监控
 *
 * @example
 * ```typescript
 * import { ExtensionEvents } from './core/types/DomainEvents';
 *
 * // 监听扩展激活
 * eventBus.subscribe('extension.activated', (event: ExtensionEvents.ExtensionActivated) => {
 *     console.log(`Extension activated in ${event.activationTime}ms`);
 *     // 初始化依赖此扩展的功能
 * });
 *
 * // 监听配置变更
 * eventBus.subscribe('extension.configuration.changed', (event: ExtensionEvents.ConfigurationChanged) => {
 *     console.log(`Config "${event.key}" changed`);
 *     console.log(`Old: ${event.oldValue}, New: ${event.newValue}`);
 *     // 应用新配置
 * });
 * ```
 */
export namespace ExtensionEvents {
    /**
     * 扩展已激活事件
     *
     * 当扩展激活完成，所有服务初始化成功后发布。
     *
     * @remarks
     * **触发时机**：
     * - VSCode 调用 activate() 函数
     * - 所有服务成功注册
     * - 初始化流程完成
     *
     * **订阅者**：
     * - 其他扩展（集成和互操作）
     * - 性能监控（记录激活时间）
     * - 通知服务（显示就绪消息）
     *
     * **性能指标**：
     * - activationTime: 激活耗时（毫秒）
     * - 用于性能优化和问题诊断
     */
    export interface ExtensionActivated extends IDomainEvent {
        /** 事件类型固定为 'extension.activated' */
        type: 'extension.activated';
        /** 激活耗时（毫秒） */
        activationTime: number;
    }

    /**
     * 扩展即将停用事件
     *
     * 当扩展即将停用，开始清理资源时发布。
     *
     * @remarks
     * **触发时机**：
     * - VSCode 即将关闭
     * - 扩展被禁用或卸载
     * - 工作区切换
     *
     * **订阅者**：
     * - 所有需要清理资源的服务
     * - 持久化管理器（保存状态）
     * - 连接管理器（关闭连接）
     * - 监控服务（记录停用原因）
     *
     * **清理任务**：
     * - 释放文件句柄
     * - 取消订阅
     * - 保存待处理数据
     * - 停止后台任务
     */
    export interface ExtensionDeactivating extends IDomainEvent {
        /** 事件类型固定为 'extension.deactivating' */
        type: 'extension.deactivating';
        /** 停用原因，例如：'shutdown', 'disable', 'reload' */
        reason: string;
    }

    /**
     * 配置已变更事件
     *
     * 当扩展的配置项发生变更时发布。
     *
     * @remarks
     * **触发时机**：
     * - 用户修改设置
     * - 工作区配置变更
     * - 编程方式修改配置
     *
     * **订阅者**：
     * - 配置依赖的所有服务
     * - 日志服务（更新日志级别）
     * - 缓存服务（更新缓存策略）
     * - UI 组件（刷新显示）
     *
     * **处理建议**：
     * - 比较 oldValue 和 newValue 确定变更内容
     * - 只在值真正变化时执行操作
     * - 考虑配置变更的副作用
     */
    export interface ConfigurationChanged extends IDomainEvent {
        /** 事件类型固定为 'extension.configuration.changed' */
        type: 'extension.configuration.changed';
        /** 变更的配置键，支持点号分隔的路径 */
        key: string;
        /** 变更前的值 */
        oldValue: unknown;
        /** 变更后的值 */
        newValue: unknown;
    }

    /**
     * 性能指标事件
     *
     * 用于记录和传播性能相关的度量数据。
     *
     * @remarks
     * **触发时机**：
     * - 关键操作完成
     * - 定时性能采样
     * - 性能阈值告警
     *
     * **订阅者**：
     * - 性能监控服务（聚合统计）
     * - 日志服务（记录性能日志）
     * - 诊断服务（性能分析）
     * - 告警服务（性能异常通知）
     *
     * **常见指标**：
     * - `template.parse.duration`: 模板解析耗时
     * - `completion.latency`: 补全响应延迟
     * - `schema.generation.time`: Schema 生成时间
     * - `memory.usage`: 内存使用量
     *
     * **单位约定**：
     * - 时间：milliseconds (ms)
     * - 内存：bytes, kilobytes (KB), megabytes (MB)
     * - 计数：count
     * - 百分比：percentage
     */
    export interface PerformanceMetric extends IDomainEvent {
        /** 事件类型固定为 'extension.performance.metric' */
        type: 'extension.performance.metric';
        /** 指标名称，使用点号分隔的命名空间 */
        metric: string;
        /** 指标值，通常是数值型数据 */
        value: number;
        /** 度量单位，例如：'ms', 'bytes', 'count' */
        unit: string;
    }
}

/**
 * 物品相关事件命名空间
 *
 * 包含物品 ID 生命周期相关的领域事件。
 */
export namespace ItemEvents {
    /** 物品已创建事件 */
    export interface ItemCreated extends IDomainEvent {
        type: 'item.created';
        item: IItemId;
    }

    /** 物品已删除事件 */
    export interface ItemDeleted extends IDomainEvent {
        type: 'item.deleted';
        itemId: string;
    }

    /** 物品已清空事件 */
    export interface ItemCleared extends IDomainEvent {
        type: 'item.cleared';
        count: number;
    }
}

/**
 * 分类相关事件命名空间
 *
 * 包含分类生命周期相关的领域事件。
 */
export namespace CategoryEvents {
    /** 分类已创建事件 */
    export interface CategoryCreated extends IDomainEvent {
        type: 'category.created';
        category: ICategory;
    }

    /** 分类已删除事件 */
    export interface CategoryDeleted extends IDomainEvent {
        type: 'category.deleted';
        categoryId: string;
    }

    /** 分类已清空事件 */
    export interface CategoryCleared extends IDomainEvent {
        type: 'category.cleared';
        count: number;
    }
}

/**
 * 翻译相关事件命名空间
 *
 * 包含翻译键生命周期相关的领域事件。
 */
export namespace TranslationEvents {
    /** 翻译键已创建事件 */
    export interface TranslationCreated extends IDomainEvent {
        type: 'translation.created';
        translationKey: ITranslationKey;
    }

    /** 翻译键已删除事件 */
    export interface TranslationDeleted extends IDomainEvent {
        type: 'translation.deleted';
        fullPath: string;
    }

    /** 翻译键已清空事件 */
    export interface TranslationCleared extends IDomainEvent {
        type: 'translation.cleared';
        count: number;
    }
}

/**
 * 数据加载状态枚举
 */
export enum DataStatus {
    /** 加载中 */
    Loading = 'loading',
    /** 加载成功 */
    Ready = 'ready',
    /** 加载失败 */
    Failed = 'failed',
    /** 部分加载 */
    Partial = 'partial',
}

/**
 * 数据状态相关事件命名空间
 */
export namespace DataEvents {
    /** 数据状态变更事件 */
    export interface DataStatusChanged extends IDomainEvent {
        type: 'data.status.changed';
        status: DataStatus;
        /** 失败原因（仅在 Failed 状态时有值） */
        error?: string;
        /** 加载的数据类别 */
        category?: string;
    }
}
