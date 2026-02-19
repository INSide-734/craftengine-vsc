/**
 * YAML 辅助工具
 * 
 * 提供 YAML 解析和位置判断的辅助方法
 */

export class YamlHelper {
    /**
     * 判断指定位置是否在注释中
     * 
     * @param lineText 当前行文本
     * @param character 字符位置
     * @returns 如果在注释中返回 true
     */
    static isInComment(lineText: string, character: number): boolean {
        // 查找行中的注释符号 '#'
        const commentIndex = this.findCommentStart(lineText);
        
        // 如果没有注释符号，或者光标在注释符号之前，则不在注释中
        if (commentIndex === -1 || character < commentIndex) {
            return false;
        }
        
        return true;
    }
    
    /**
     * 查找注释开始位置
     * 
     * 需要处理以下情况：
     * 1. 字符串中的 # 不是注释
     * 2. 转义的 # 不是注释
     * 
     * @param lineText 行文本
     * @returns 注释开始位置，如果没有注释返回 -1
     */
    private static findCommentStart(lineText: string): number {
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let escaped = false;
        
        for (let i = 0; i < lineText.length; i++) {
            const char = lineText[i];
            
            // 处理转义
            if (escaped) {
                escaped = false;
                continue;
            }
            
            if (char === '\\') {
                escaped = true;
                continue;
            }
            
            // 处理引号
            if (char === "'" && !inDoubleQuote) {
                inSingleQuote = !inSingleQuote;
                continue;
            }
            
            if (char === '"' && !inSingleQuote) {
                inDoubleQuote = !inDoubleQuote;
                continue;
            }
            
            // 如果不在引号中且遇到 #，则是注释开始
            if (char === '#' && !inSingleQuote && !inDoubleQuote) {
                return i;
            }
        }
        
        return -1;
    }
    
    /**
     * 从行文本中提取非注释部分
     * 
     * @param lineText 行文本
     * @returns 非注释部分的文本
     */
    static getLineWithoutComment(lineText: string): string {
        const commentIndex = this.findCommentStart(lineText);
        
        if (commentIndex === -1) {
            return lineText;
        }
        
        return lineText.substring(0, commentIndex);
    }
    
    /**
     * 判断整行是否是纯注释行（忽略前导空格）
     * 
     * @param lineText 行文本
     * @returns 如果是纯注释行返回 true
     */
    static isPureCommentLine(lineText: string): boolean {
        const trimmed = lineText.trim();
        return trimmed.startsWith('#') || trimmed === '';
    }
    
    /**
     * 提取行文本中指定范围的内容，排除注释部分
     * 
     * @param lineText 行文本
     * @param start 开始位置
     * @param end 结束位置
     * @returns 提取的文本，如果在注释中返回空字符串
     */
    static extractNonCommentText(lineText: string, start: number, end: number): string {
        const commentIndex = this.findCommentStart(lineText);
        
        // 如果整个范围在注释中，返回空字符串
        if (commentIndex !== -1 && start >= commentIndex) {
            return '';
        }
        
        // 如果范围跨越注释边界，截取到注释前
        if (commentIndex !== -1 && end > commentIndex) {
            end = commentIndex;
        }
        
        return lineText.substring(start, end);
    }
    
    /**
     * 判断匹配结果是否在注释中
     * 
     * @param lineText 行文本
     * @param match 正则匹配结果
     * @param captureGroup 捕获组索引（默认为1，即第一个捕获组）
     * @returns 如果匹配在注释中返回 true
     */
    static isMatchInComment(lineText: string, match: RegExpExecArray | RegExpMatchArray, captureGroup: number = 1): boolean {
        if (!match || !match.index) {
            return false;
        }
        
        // 计算捕获组的实际位置
        let captureStart = match.index;
        
        // 如果有捕获组，计算捕获组的位置
        if (captureGroup > 0 && match.length > captureGroup) {
            const fullMatch = match[0];
            const captureText = match[captureGroup];
            const captureOffset = fullMatch.indexOf(captureText);
            
            if (captureOffset !== -1) {
                captureStart = match.index + captureOffset;
            }
        }
        
        return this.isInComment(lineText, captureStart);
    }
}


