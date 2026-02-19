import { ServiceContainer } from '../../ServiceContainer';
import { ILogger } from '../../../core/interfaces/ILogger';
import { SERVICE_TOKENS } from '../../../core/constants/ServiceTokens';
import { DataConfigLoader } from '../../data/DataConfigLoader';
import {
    IMiniMessageConstantsConfig,
    IMiniMessageFullTagDefinition,
    IMiniMessageTagArgument
} from '../../../core/interfaces/IDataConfigLoader';

// ============================================================================
// 类型定义（保持向后兼容）
// ============================================================================

/**
 * MiniMessage 标签参数定义
 */
export interface MiniMessageTagArgument {
    /** 参数名称 */
    name: string;
    /** 参数类型（string, number, boolean, enum, color） */
    type: string;
    /** 是否为必填参数 */
    required: boolean;
    /** 参数描述 */
    description: string;
    /** 枚举类型的可选值列表 */
    enumValues?: string[];
}

/**
 * MiniMessage 标签定义
 *
 * @remarks
 * 从 data/schema/minimessage-constants.json 的 tags 字段加载。
 */
export interface MiniMessageTagDefinition {
    /** 标签名称（主名称） */
    name: string;
    /** 别名列表（可选） */
    aliases?: string[];
    /** 标签语法示例 */
    syntax: string;
    /** 标签功能描述 */
    description: string;
    /** 参数定义列表 */
    arguments?: MiniMessageTagArgument[];
    /** 是否为自闭合标签（如 <reset>, <newline>） */
    selfClosing?: boolean;
    /** 使用示例 */
    example: string;
    /** 标签分类（color, decoration, event, format, special, craftengine） */
    category: string;
    /** VSCode 代码片段格式的插入文本 */
    insertSnippet?: string;
}

/**
 * 十六进制颜色定义
 *
 * @remarks
 * 从 data/schema/minimessage-constants.json 的 commonHexColors 字段加载。
 */
export interface HexColorDefinition {
    /** 十六进制颜色值（不含 #） */
    hex: string;
    /** 颜色名称 */
    name: string;
    /** 颜色描述 */
    description?: string;
}

/**
 * MiniMessage Schema 数据结构
 *
 * @remarks
 * 对应 data/schema/minimessage-constants.json 文件的结构。
 */
export interface MiniMessageSchemaData {
    /** 命名颜色列表 */
    colors: string[];
    /** 点击事件动作类型 */
    clickActions: string[];
    /** 悬停事件动作类型 */
    hoverActions: string[];
    /** Pride 旗帜类型 */
    prideFlags: string[];
    /** 键位绑定标识符 */
    keybinds: string[];
    /** NBT 数据源类型 */
    nbtSourceTypes: string[];
    /** 常用十六进制颜色 */
    commonHexColors: HexColorDefinition[];
    /** 标签定义列表 */
    tags: MiniMessageTagDefinition[];
}

// ============================================================================
// MiniMessage 数据加载器
// ============================================================================

/**
 * MiniMessage 数据加载器
 *
 * @remarks
 * 单例模式实现，负责从 data/schema/minimessage-constants.json 加载 MiniMessage 相关数据。
 * 使用 DataConfigLoader 进行文件加载，确保与其他数据配置的一致性。
 *
 * 加载的数据包括：
 * - 命名颜色（colors）
 * - 点击/悬停事件动作类型
 * - Pride 旗帜、键位绑定、NBT 源类型
 * - 常用十六进制颜色
 * - 标签定义
 *
 * @example
 * ```typescript
 * const loader = MiniMessageDataLoader.getInstance();
 * await loader.ensureLoaded(); // 确保数据已加载
 * const colors = loader.getColors();
 * const tags = loader.getAllTags();
 * ```
 */
export class MiniMessageDataLoader {
    /** 单例实例 */
    private static instance: MiniMessageDataLoader;

    /** Schema 数据缓存 */
    private data: MiniMessageSchemaData | null = null;

    /** 完整标签列表（包括动态生成的颜色标签） */
    private allTags: MiniMessageTagDefinition[] = [];

    /** 所有有效标签名称集合（包括别名） */
    private validTagNames: Set<string> = new Set();

    /** 自闭合标签集合 */
    private selfClosingTags: Set<string> = new Set();

    /** 需要参数的标签集合 */
    private tagsRequiringArguments: Set<string> = new Set();

    /** 日志记录器 */
    private readonly logger: ILogger;

    /** 数据配置加载器 */
    private readonly dataConfigLoader: DataConfigLoader;

    /** 初始化 Promise（确保只加载一次） */
    private initPromise: Promise<void> | null = null;

    /** 是否已加载 */
    private loaded: boolean = false;

    /**
     * 私有构造函数
     */
    private constructor() {
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger)
            .createChild('MiniMessageDataLoader');
        this.dataConfigLoader = new DataConfigLoader(
            ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger)
        );
    }

    /**
     * 获取单例实例
     *
     * @returns MiniMessageDataLoader 单例
     */
    static getInstance(): MiniMessageDataLoader {
        if (!MiniMessageDataLoader.instance) {
            MiniMessageDataLoader.instance = new MiniMessageDataLoader();
        }
        return MiniMessageDataLoader.instance;
    }

    /**
     * 确保数据已加载
     *
     * @remarks
     * 在访问数据之前调用此方法确保数据已加载。
     * 多次调用是安全的，只会加载一次。
     */
    async ensureLoaded(): Promise<void> {
        if (this.loaded) {
            return;
        }

        if (!this.initPromise) {
            this.initPromise = this.loadData();
        }

        await this.initPromise;
    }

    /**
     * 从 DataConfigLoader 加载数据
     */
    private async loadData(): Promise<void> {
        try {
            this.logger.debug('Loading MiniMessage data via DataConfigLoader');

            const config = await this.dataConfigLoader.loadMiniMessageConstantsConfig();

            // 转换数据结构
            this.data = this.convertConfigToSchemaData(config);

            // 构建完整的标签列表和集合
            this.buildAllTags();
            this.buildTagSets();

            this.loaded = true;

            this.logger.debug('MiniMessage data loaded successfully', {
                colorCount: this.data.colors.length,
                tagCount: this.data.tags.length,
                hexColorCount: this.data.commonHexColors.length,
                validTagCount: this.validTagNames.size
            });

        } catch (error) {
            this.logger.error('Failed to load MiniMessage data', error as Error);
            this.initializeEmptyData();
            this.loaded = true; // 标记为已加载，避免重复尝试
        }
    }

    /**
     * 将配置数据转换为内部数据结构
     */
    private convertConfigToSchemaData(config: IMiniMessageConstantsConfig): MiniMessageSchemaData {
        return {
            colors: config.colors,
            clickActions: config.clickActions.map(a => a.name),
            hoverActions: config.hoverActions.map(a => a.name),
            prideFlags: config.prideFlags,
            keybinds: config.keybinds.map(k => k.key),
            nbtSourceTypes: config.nbtSourceTypes.map(t => t.name),
            commonHexColors: config.commonHexColors.map(c => ({
                hex: c.hex,
                name: c.name,
                description: c.description
            })),
            tags: config.tags.map(t => this.convertTagDefinition(t))
        };
    }

    /**
     * 转换标签定义
     */
    private convertTagDefinition(tag: IMiniMessageFullTagDefinition): MiniMessageTagDefinition {
        return {
            name: tag.name,
            aliases: tag.aliases,
            syntax: tag.syntax,
            description: tag.description,
            arguments: tag.arguments?.map(a => this.convertTagArgument(a)),
            selfClosing: tag.selfClosing,
            example: tag.example,
            category: tag.category,
            insertSnippet: tag.insertSnippet
        };
    }

    /**
     * 转换标签参数定义
     */
    private convertTagArgument(arg: IMiniMessageTagArgument): MiniMessageTagArgument {
        return {
            name: arg.name,
            type: arg.type,
            required: arg.required,
            description: arg.description,
            enumValues: arg.enumValues
        };
    }

    /**
     * 初始化空数据结构
     *
     * @remarks
     * 当数据加载失败时使用，确保数据访问器不会返回 undefined。
     */
    private initializeEmptyData(): void {
        this.data = {
            colors: [],
            clickActions: [],
            hoverActions: [],
            prideFlags: [],
            keybinds: [],
            nbtSourceTypes: [],
            commonHexColors: [],
            tags: []
        };
        this.allTags = [];
        this.validTagNames = new Set();
        this.selfClosingTags = new Set();
        this.tagsRequiringArguments = new Set();
    }

    /**
     * 构建完整的标签列表
     *
     * @remarks
     * 将命名颜色转换为颜色标签，并与其他标签合并。
     * 颜色标签会自动生成 insertSnippet 用于智能补全。
     */
    private buildAllTags(): void {
        if (!this.data) {
            return;
        }

        // 将命名颜色转换为标签定义
        const colorTags: MiniMessageTagDefinition[] = this.data.colors.map(color => ({
            name: color,
            syntax: `<${color}>`,
            description: `Apply ${color} color to text`,
            example: `<${color}>Colored text</${color}>`,
            category: 'color',
            insertSnippet: `<${color}>\${1:text}</${color}>`
        }));

        // 合并颜色标签和其他标签
        this.allTags = [...colorTags, ...this.data.tags];
    }

    /**
     * 构建标签集合用于快速查找
     */
    private buildTagSets(): void {
        this.validTagNames.clear();
        this.selfClosingTags.clear();
        this.tagsRequiringArguments.clear();

        for (const tag of this.allTags) {
            // 添加主名称
            this.validTagNames.add(tag.name);

            // 添加别名
            if (tag.aliases) {
                for (const alias of tag.aliases) {
                    this.validTagNames.add(alias);
                }
            }

            // 跟踪自闭合标签
            if (tag.selfClosing) {
                this.selfClosingTags.add(tag.name);
                if (tag.aliases) {
                    for (const alias of tag.aliases) {
                        this.selfClosingTags.add(alias);
                    }
                }
            }

            // 跟踪需要参数的标签
            if (tag.arguments && tag.arguments.some(arg => arg.required)) {
                this.tagsRequiringArguments.add(tag.name);
                if (tag.aliases) {
                    for (const alias of tag.aliases) {
                        this.tagsRequiringArguments.add(alias);
                    }
                }
            }
        }
    }

    // ==================== 数据访问器 ====================

    /**
     * 获取所有命名颜色
     * @returns 颜色名称数组
     */
    getColors(): string[] {
        return this.data?.colors || [];
    }

    /**
     * 获取点击事件动作类型
     * @returns 动作类型数组
     */
    getClickActions(): string[] {
        return this.data?.clickActions || [];
    }

    /**
     * 获取悬停事件动作类型
     * @returns 动作类型数组
     */
    getHoverActions(): string[] {
        return this.data?.hoverActions || [];
    }

    /**
     * 获取 Pride 旗帜类型
     * @returns 旗帜类型数组
     */
    getPrideFlags(): string[] {
        return this.data?.prideFlags || [];
    }

    /**
     * 获取键位绑定标识符
     * @returns 键位绑定数组
     */
    getKeybinds(): string[] {
        return this.data?.keybinds || [];
    }

    /**
     * 获取 NBT 数据源类型
     * @returns 源类型数组
     */
    getNbtSourceTypes(): string[] {
        return this.data?.nbtSourceTypes || [];
    }

    /**
     * 获取常用十六进制颜色
     * @returns 十六进制颜色定义数组
     */
    getCommonHexColors(): HexColorDefinition[] {
        return this.data?.commonHexColors || [];
    }

    /**
     * 获取所有标签定义（包括颜色标签）
     * @returns 完整的标签定义数组
     */
    getAllTags(): MiniMessageTagDefinition[] {
        return this.allTags;
    }

    /**
     * 获取所有有效标签名称集合（包括别名）
     * @returns 有效标签名称集合
     */
    getValidTagNames(): Set<string> {
        return this.validTagNames;
    }

    /**
     * 获取自闭合标签集合
     * @returns 自闭合标签名称集合
     */
    getSelfClosingTags(): Set<string> {
        return this.selfClosingTags;
    }

    /**
     * 获取需要参数的标签集合
     * @returns 需要参数的标签名称集合
     */
    getTagsRequiringArguments(): Set<string> {
        return this.tagsRequiringArguments;
    }

    /**
     * 检查标签名称是否有效
     * @param tagName - 要检查的标签名称
     * @returns 如果有效返回 true
     */
    isValidTag(tagName: string): boolean {
        return this.validTagNames.has(tagName.toLowerCase());
    }

    /**
     * 检查标签是否为自闭合标签
     * @param tagName - 要检查的标签名称
     * @returns 如果是自闭合标签返回 true
     */
    isSelfClosingTag(tagName: string): boolean {
        return this.selfClosingTags.has(tagName.toLowerCase());
    }

    /**
     * 检查标签是否需要参数
     * @param tagName - 要检查的标签名称
     * @returns 如果需要参数返回 true
     */
    tagRequiresArguments(tagName: string): boolean {
        return this.tagsRequiringArguments.has(tagName.toLowerCase());
    }

    /**
     * 检查颜色名称是否有效
     * @param colorName - 要检查的颜色名称
     * @returns 如果有效返回 true
     */
    isValidColorName(colorName: string): boolean {
        return this.data?.colors.includes(colorName.toLowerCase()) || false;
    }

    /**
     * 检查点击动作是否有效
     * @param action - 要检查的动作
     * @returns 如果有效返回 true
     */
    isValidClickAction(action: string): boolean {
        return this.data?.clickActions.includes(action) || false;
    }

    /**
     * 检查悬停动作是否有效
     * @param action - 要检查的动作
     * @returns 如果有效返回 true
     */
    isValidHoverAction(action: string): boolean {
        return this.data?.hoverActions.includes(action) || false;
    }
}
