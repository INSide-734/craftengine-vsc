import { 
    DefinitionProvider, 
    TextDocument, 
    Position, 
    Definition, 
    LocationLink,
    Range,
    CancellationToken,
    Uri
} from 'vscode';
import { ServiceContainer } from '../../infrastructure/ServiceContainer';
import { IDataStoreService } from '../../core/interfaces/IDataStoreService';
import { ILogger } from '../../core/interfaces/ILogger';
import { IConfiguration } from '../../core/interfaces/IConfiguration';
import { SERVICE_TOKENS } from '../../core/constants/ServiceTokens';
import { PerformanceMonitor } from '../../infrastructure/performance/PerformanceMonitor';
import { YamlHelper } from '../../infrastructure/yaml/YamlHelper';

/**
 * 物品 ID 定义跳转提供者
 * 
 * 提供从物品 ID 使用位置跳转到物品定义的功能
 */
export class ItemIdDefinitionProvider implements DefinitionProvider {
    private readonly dataStoreService: IDataStoreService;
    private readonly logger: ILogger;
    private readonly configuration: IConfiguration;
    private readonly performanceMonitor: PerformanceMonitor;
    
    /** 命名空间 ID 正则表达式 */
    private static readonly NAMESPACED_ID_PATTERN = /[a-z][a-z0-9_-]*:[a-z][a-z0-9_/-]*/g;
    
    constructor() {
        this.dataStoreService = ServiceContainer.getService<IDataStoreService>(SERVICE_TOKENS.DataStoreService);
        this.logger = ServiceContainer.getService<ILogger>(SERVICE_TOKENS.Logger).createChild('ItemIdDefinitionProvider');
        this.configuration = ServiceContainer.getService<IConfiguration>(SERVICE_TOKENS.Configuration);
        this.performanceMonitor = ServiceContainer.getService<PerformanceMonitor>(SERVICE_TOKENS.PerformanceMonitor);
    }
    
    async provideDefinition(
        document: TextDocument,
        position: Position,
        token?: CancellationToken
    ): Promise<Definition | LocationLink[] | undefined> {
        const timer = this.performanceMonitor.startTimer('itemId.definition.provide');
        
        try {
            // 检查功能是否启用
            if (!this.configuration.get('definition.enabled', true)) {
                return undefined;
            }
            
            if (token?.isCancellationRequested) {
                return undefined;
            }
            
            // 获取光标位置的物品 ID 和范围
            const itemIdInfo = await this.getItemIdAtPosition(document, position);
            if (!itemIdInfo) {
                return undefined;
            }
            
            this.logger.debug('Item ID detected for definition', {
                itemId: itemIdInfo.id,
                range: itemIdInfo.range
            });
            
            // 搜索物品定义
            const item = await this.dataStoreService.getItemById(itemIdInfo.id);
            
            if (!item) {
                this.logger.debug('Item definition not found', { itemId: itemIdInfo.id });
                return undefined;
            }
            
            // 创建定义位置
            const targetUri = Uri.file(item.sourceFile);
            const targetLine = item.lineNumber ?? 0;
            const targetPosition = new Position(targetLine, 0);
            const targetRange = new Range(targetPosition, targetPosition);
            
            const locationLink: LocationLink = {
                originSelectionRange: itemIdInfo.range,
                targetUri: targetUri,
                targetRange: targetRange,
                targetSelectionRange: targetRange
            };
            
            this.logger.debug('Item definition found', {
                itemId: item.id,
                file: item.sourceFile,
                line: targetLine
            });
            
            return [locationLink];
            
        } catch (error) {
            this.logger.error('Error providing item definition', error as Error, {
                file: document.fileName,
                position: { line: position.line, character: position.character }
            });
            return undefined;
        } finally {
            timer.stop({ 
                document: document.fileName 
            });
        }
    }
    
    /**
     * 获取光标位置的物品 ID 和范围
     */
    private async getItemIdAtPosition(
        document: TextDocument, 
        position: Position
    ): Promise<{ id: string; range: Range } | undefined> {
        const line = document.lineAt(position);
        const lineText = line.text;
        
        // 检查光标是否在注释中
        if (YamlHelper.isInComment(lineText, position.character)) {
            return undefined;
        }
        
        // 查找行中所有的命名空间 ID
        const pattern = new RegExp(ItemIdDefinitionProvider.NAMESPACED_ID_PATTERN.source, 'g');
        let match;
        
        while ((match = pattern.exec(lineText)) !== null) {
            const itemId = match[0];
            const startPos = match.index;
            const endPos = startPos + itemId.length;
            
            // 检查光标是否在此 ID 范围内
            if (position.character >= startPos && position.character <= endPos) {
                // 检查是否在注释中
                if (YamlHelper.isMatchInComment(lineText, match, 0)) {
                    continue;
                }
                
                // 检查物品是否存在于数据存储中
                const item = await this.dataStoreService.getItemById(itemId);
                if (item) {
                    const range = new Range(
                        position.line, startPos,
                        position.line, endPos
                    );
                    return { id: itemId, range };
                }
            }
        }
        
        return undefined;
    }
}

