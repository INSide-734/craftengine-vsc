import { type ITranslationReference } from '../../../core/interfaces/ITranslation';

/**
 * 翻译引用索引存储
 *
 * 在文档解析阶段收集所有 `<i18n:key>` / `<l10n:key>` 引用，
 * 提供按键名的 O(1) 查询，避免 Find References 时全量扫描文件。
 */
export class TranslationReferenceStore {
    /** 键名 -> 引用集合 */
    private readonly referencesByKey = new Map<string, ITranslationReference[]>();
    /** 文件路径 -> 键名集合（用于按文件快速清理） */
    private readonly fileIndex = new Map<string, Set<string>>();

    constructor() {}

    /**
     * 添加一条翻译引用
     */
    addReference(ref: ITranslationReference): void {
        // 按键名索引
        let refs = this.referencesByKey.get(ref.key);
        if (!refs) {
            refs = [];
            this.referencesByKey.set(ref.key, refs);
        }
        refs.push(ref);

        // 按文件索引
        let keys = this.fileIndex.get(ref.sourceFile);
        if (!keys) {
            keys = new Set();
            this.fileIndex.set(ref.sourceFile, keys);
        }
        keys.add(ref.key);
    }

    /**
     * 按键名查询所有引用
     */
    getReferences(keyName: string): readonly ITranslationReference[] {
        return this.referencesByKey.get(keyName) ?? [];
    }

    /**
     * 移除指定文件的所有引用
     */
    removeByFile(sourceFile: string): void {
        const keys = this.fileIndex.get(sourceFile);
        if (!keys) {
            return;
        }

        for (const key of keys) {
            const refs = this.referencesByKey.get(key);
            if (refs) {
                const filtered = refs.filter((r) => r.sourceFile !== sourceFile);
                if (filtered.length === 0) {
                    this.referencesByKey.delete(key);
                } else {
                    this.referencesByKey.set(key, filtered);
                }
            }
        }

        this.fileIndex.delete(sourceFile);
    }

    /**
     * 清空所有数据
     */
    clear(): void {
        this.referencesByKey.clear();
        this.fileIndex.clear();
    }

    /**
     * 获取引用总数
     */
    getCount(): number {
        let count = 0;
        for (const refs of this.referencesByKey.values()) {
            count += refs.length;
        }
        return count;
    }

    /**
     * 获取包含引用的文件数
     */
    getFileCount(): number {
        return this.fileIndex.size;
    }

    /**
     * 获取被引用的唯一键名数
     */
    getKeyCount(): number {
        return this.referencesByKey.size;
    }
}
