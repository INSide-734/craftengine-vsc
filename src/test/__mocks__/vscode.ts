/**
 * VSCode API Mock
 *
 * 提供 VSCode API 的模拟实现，用于单元测试。
 * 只 Mock 项目中实际使用的 API，按需扩展。
 */
import { vi } from 'vitest';

// ========================================
// URI 类
// ========================================

/**
 * Mock Uri 类
 * 模拟 VSCode 的 Uri 类，提供文件路径处理功能
 */
export class Uri {
    readonly scheme: string;
    readonly authority: string;
    readonly path: string;
    readonly query: string;
    readonly fragment: string;
    readonly fsPath: string;

    private constructor(scheme: string, authority: string, path: string, query: string, fragment: string) {
        this.scheme = scheme;
        this.authority = authority;
        this.path = path;
        this.query = query;
        this.fragment = fragment;
        // 在 Windows 上转换路径
        this.fsPath = path.startsWith('/') && path[2] === ':' ? path.substring(1).replace(/\//g, '\\') : path;
    }

    toString(): string {
        return `${this.scheme}://${this.authority}${this.path}`;
    }

    toJSON(): object {
        return {
            scheme: this.scheme,
            authority: this.authority,
            path: this.path,
            query: this.query,
            fragment: this.fragment,
            fsPath: this.fsPath,
        };
    }

    with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
        return new Uri(
            change.scheme ?? this.scheme,
            change.authority ?? this.authority,
            change.path ?? this.path,
            change.query ?? this.query,
            change.fragment ?? this.fragment,
        );
    }

    static parse(value: string): Uri {
        const url = new URL(value);
        return new Uri(url.protocol.replace(':', ''), url.hostname, url.pathname, url.search, url.hash);
    }

    static file(path: string): Uri {
        // 标准化路径
        const normalizedPath = path.replace(/\\/g, '/');
        const fullPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
        return new Uri('file', '', fullPath, '', '');
    }

    static joinPath(base: Uri, ...pathSegments: string[]): Uri {
        const joinedPath = [base.path, ...pathSegments].join('/').replace(/\/+/g, '/');
        return base.with({ path: joinedPath });
    }
}

// ========================================
// Position 和 Range 类
// ========================================

/**
 * Mock Position 类
 * 表示文档中的位置（行号和字符位置）
 */
export class Position {
    readonly line: number;
    readonly character: number;

    constructor(line: number, character: number) {
        this.line = line;
        this.character = character;
    }

    isEqual(other: Position): boolean {
        return this.line === other.line && this.character === other.character;
    }

    isBefore(other: Position): boolean {
        if (this.line < other.line) {
            return true;
        }
        if (this.line > other.line) {
            return false;
        }
        return this.character < other.character;
    }

    isAfter(other: Position): boolean {
        if (this.line > other.line) {
            return true;
        }
        if (this.line < other.line) {
            return false;
        }
        return this.character > other.character;
    }

    isBeforeOrEqual(other: Position): boolean {
        return this.isBefore(other) || this.isEqual(other);
    }

    isAfterOrEqual(other: Position): boolean {
        return this.isAfter(other) || this.isEqual(other);
    }

    translate(lineDelta?: number | { lineDelta?: number; characterDelta?: number }, characterDelta?: number): Position {
        if (typeof lineDelta === 'object') {
            return new Position(
                this.line + (lineDelta.lineDelta ?? 0),
                this.character + (lineDelta.characterDelta ?? 0),
            );
        }
        return new Position(this.line + (lineDelta ?? 0), this.character + (characterDelta ?? 0));
    }

    with(line?: number, character?: number): Position {
        return new Position(line ?? this.line, character ?? this.character);
    }

    compareTo(other: Position): number {
        if (this.line < other.line) {
            return -1;
        }
        if (this.line > other.line) {
            return 1;
        }
        if (this.character < other.character) {
            return -1;
        }
        if (this.character > other.character) {
            return 1;
        }
        return 0;
    }
}

/**
 * Mock Range 类
 * 表示文档中的范围（起始位置到结束位置）
 */
export class Range {
    readonly start: Position;
    readonly end: Position;

    constructor(start: Position, end: Position);
    constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
    constructor(
        startOrStartLine: Position | number,
        endOrStartCharacter: Position | number,
        endLine?: number,
        endCharacter?: number,
    ) {
        if (typeof startOrStartLine === 'number') {
            this.start = new Position(startOrStartLine, endOrStartCharacter as number);
            this.end = new Position(endLine!, endCharacter!);
        } else {
            this.start = startOrStartLine;
            this.end = endOrStartCharacter as Position;
        }
    }

    get isEmpty(): boolean {
        return this.start.isEqual(this.end);
    }

    get isSingleLine(): boolean {
        return this.start.line === this.end.line;
    }

    contains(positionOrRange: Position | Range): boolean {
        if (positionOrRange instanceof Position) {
            return positionOrRange.isAfterOrEqual(this.start) && positionOrRange.isBeforeOrEqual(this.end);
        }
        return this.contains(positionOrRange.start) && this.contains(positionOrRange.end);
    }

    isEqual(other: Range): boolean {
        return this.start.isEqual(other.start) && this.end.isEqual(other.end);
    }

    intersection(range: Range): Range | undefined {
        const start = this.start.isBefore(range.start) ? range.start : this.start;
        const end = this.end.isAfter(range.end) ? range.end : this.end;
        if (start.isAfter(end)) {
            return undefined;
        }
        return new Range(start, end);
    }

    union(other: Range): Range {
        const start = this.start.isBefore(other.start) ? this.start : other.start;
        const end = this.end.isAfter(other.end) ? this.end : other.end;
        return new Range(start, end);
    }

    with(start?: Position, end?: Position): Range {
        return new Range(start ?? this.start, end ?? this.end);
    }
}

// ========================================
// 文档相关
// ========================================

/**
 * Mock TextDocument 类
 * 模拟 VSCode 的文本文档
 */
export class TextDocument {
    readonly uri: Uri;
    readonly fileName: string;
    readonly languageId: string;
    readonly version: number;
    readonly isDirty: boolean;
    readonly isUntitled: boolean;
    readonly isClosed: boolean;
    readonly encoding: string;
    readonly eol: EndOfLine;
    readonly lineCount: number;
    private readonly _content: string;
    private readonly _lines: string[];

    constructor(uri: Uri, content: string, languageId: string = 'yaml', version: number = 1) {
        this.uri = uri;
        this.fileName = uri.fsPath;
        this.languageId = languageId;
        this.version = version;
        this.isDirty = false;
        this.isUntitled = false;
        this.isClosed = false;
        this.encoding = 'utf8';
        this.eol = EndOfLine.LF;
        this._content = content;
        this._lines = content.split('\n');
        this.lineCount = this._lines.length;
    }

    getText(range?: Range): string {
        if (!range) {
            return this._content;
        }

        const startOffset = this.offsetAt(range.start);
        const endOffset = this.offsetAt(range.end);
        return this._content.substring(startOffset, endOffset);
    }

    lineAt(line: number | Position): TextLine {
        const lineNumber = typeof line === 'number' ? line : line.line;
        const text = this._lines[lineNumber] || '';
        return {
            lineNumber,
            text,
            range: new Range(lineNumber, 0, lineNumber, text.length),
            rangeIncludingLineBreak: new Range(
                lineNumber,
                0,
                lineNumber + 1 < this._lines.length ? lineNumber + 1 : lineNumber,
                lineNumber + 1 < this._lines.length ? 0 : text.length,
            ),
            firstNonWhitespaceCharacterIndex: text.search(/\S/),
            isEmptyOrWhitespace: text.trim().length === 0,
        };
    }

    offsetAt(position: Position): number {
        let offset = 0;
        for (let i = 0; i < position.line && i < this._lines.length; i++) {
            offset += this._lines[i].length + 1; // +1 for newline
        }
        offset += Math.min(position.character, (this._lines[position.line] || '').length);
        return offset;
    }

    positionAt(offset: number): Position {
        let line = 0;
        let currentOffset = 0;

        while (line < this._lines.length) {
            const lineLength = this._lines[line].length + 1;
            if (currentOffset + lineLength > offset) {
                return new Position(line, offset - currentOffset);
            }
            currentOffset += lineLength;
            line++;
        }

        return new Position(this._lines.length - 1, this._lines[this._lines.length - 1].length);
    }

    getWordRangeAtPosition(position: Position, regex?: RegExp): Range | undefined {
        const line = this._lines[position.line];
        if (!line) {
            return undefined;
        }

        const wordPattern = regex || /\w+/g;
        let match: RegExpExecArray | null;

        while ((match = wordPattern.exec(line)) !== null) {
            if (match.index <= position.character && match.index + match[0].length >= position.character) {
                return new Range(position.line, match.index, position.line, match.index + match[0].length);
            }
        }

        return undefined;
    }

    validateRange(range: Range): Range {
        const start = this.validatePosition(range.start);
        const end = this.validatePosition(range.end);
        if (start === range.start && end === range.end) {
            return range;
        }
        return new Range(start, end);
    }

    validatePosition(position: Position): Position {
        const line = Math.max(0, Math.min(position.line, this._lines.length - 1));
        const maxChar = (this._lines[line] || '').length;
        const character = Math.max(0, Math.min(position.character, maxChar));
        if (line === position.line && character === position.character) {
            return position;
        }
        return new Position(line, character);
    }

    save(): Thenable<boolean> {
        return Promise.resolve(true);
    }
}

/**
 * TextLine 接口
 */
export interface TextLine {
    readonly lineNumber: number;
    readonly text: string;
    readonly range: Range;
    readonly rangeIncludingLineBreak: Range;
    readonly firstNonWhitespaceCharacterIndex: number;
    readonly isEmptyOrWhitespace: boolean;
}

// ========================================
// 枚举
// ========================================

export enum EndOfLine {
    LF = 1,
    CRLF = 2,
}

export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
}

export enum CompletionItemKind {
    Text = 0,
    Method = 1,
    Function = 2,
    Constructor = 3,
    Field = 4,
    Variable = 5,
    Class = 6,
    Interface = 7,
    Module = 8,
    Property = 9,
    Unit = 10,
    Value = 11,
    Enum = 12,
    Keyword = 13,
    Snippet = 14,
    Color = 15,
    File = 16,
    Reference = 17,
    Folder = 18,
    EnumMember = 19,
    Constant = 20,
    Struct = 21,
    Event = 22,
    Operator = 23,
    TypeParameter = 24,
}

export enum CompletionTriggerKind {
    Invoke = 0,
    TriggerCharacter = 1,
    TriggerForIncompleteCompletions = 2,
}

export enum CodeActionKind {
    Empty = '',
    QuickFix = 'quickfix',
    Refactor = 'refactor',
    RefactorExtract = 'refactor.extract',
    RefactorInline = 'refactor.inline',
    RefactorRewrite = 'refactor.rewrite',
    Source = 'source',
    SourceOrganizeImports = 'source.organizeImports',
    SourceFixAll = 'source.fixAll',
}

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

// ========================================
// 补全相关
// ========================================

export class CompletionItem {
    label: string | { label: string; description?: string; detail?: string };
    kind?: CompletionItemKind;
    detail?: string;
    documentation?: string | MarkdownString;
    sortText?: string;
    filterText?: string;
    insertText?: string | SnippetString;
    range?: Range | { inserting: Range; replacing: Range };
    commitCharacters?: string[];
    command?: Command;

    constructor(label: string | { label: string }, kind?: CompletionItemKind) {
        this.label = label;
        this.kind = kind;
    }
}

export class CompletionList {
    isIncomplete: boolean;
    items: CompletionItem[];

    constructor(items?: CompletionItem[], isIncomplete?: boolean) {
        this.items = items || [];
        this.isIncomplete = isIncomplete || false;
    }
}

// ========================================
// Markdown 和 Snippet
// ========================================

export class MarkdownString {
    value: string;
    isTrusted?: boolean;
    supportThemeIcons?: boolean;
    supportHtml?: boolean;

    constructor(value?: string, supportThemeIcons?: boolean) {
        this.value = value || '';
        this.supportThemeIcons = supportThemeIcons;
    }

    appendText(value: string): MarkdownString {
        this.value += value.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&');
        return this;
    }

    appendMarkdown(value: string): MarkdownString {
        this.value += value;
        return this;
    }

    appendCodeblock(value: string, language?: string): MarkdownString {
        this.value += '\n```' + (language || '') + '\n' + value + '\n```\n';
        return this;
    }
}

export class SnippetString {
    value: string;

    constructor(value?: string) {
        this.value = value || '';
    }

    appendText(value: string): SnippetString {
        this.value += value.replace(/[$\\}]/g, '\\$&');
        return this;
    }

    appendTabstop(number?: number): SnippetString {
        this.value += '$' + (number || '');
        return this;
    }

    appendPlaceholder(value: string | ((snippet: SnippetString) => void), number?: number): SnippetString {
        if (typeof value === 'function') {
            const nested = new SnippetString();
            value(nested);
            this.value += '${' + (number || '') + ':' + nested.value + '}';
        } else {
            this.value += '${' + (number || '') + ':' + value + '}';
        }
        return this;
    }

    appendChoice(values: string[], number?: number): SnippetString {
        this.value += '${' + (number || '') + '|' + values.join(',') + '|}';
        return this;
    }

    appendVariable(name: string, defaultValue?: string | ((snippet: SnippetString) => void)): SnippetString {
        if (typeof defaultValue === 'function') {
            const nested = new SnippetString();
            defaultValue(nested);
            this.value += '${' + name + ':' + nested.value + '}';
        } else if (defaultValue !== undefined) {
            this.value += '${' + name + ':' + defaultValue + '}';
        } else {
            this.value += '$' + name;
        }
        return this;
    }
}

// ========================================
// 诊断
// ========================================

export class Diagnostic {
    range: Range;
    message: string;
    severity: DiagnosticSeverity;
    source?: string;
    code?: string | number | { value: string | number; target: Uri };
    relatedInformation?: DiagnosticRelatedInformation[];

    constructor(range: Range, message: string, severity?: DiagnosticSeverity) {
        this.range = range;
        this.message = message;
        this.severity = severity ?? DiagnosticSeverity.Error;
    }
}

export class DiagnosticRelatedInformation {
    location: Location;
    message: string;

    constructor(location: Location, message: string) {
        this.location = location;
        this.message = message;
    }
}

// ========================================
// 位置和代码操作
// ========================================

export class Location {
    uri: Uri;
    range: Range;

    constructor(uri: Uri, rangeOrPosition: Range | Position) {
        this.uri = uri;
        this.range =
            rangeOrPosition instanceof Position ? new Range(rangeOrPosition, rangeOrPosition) : rangeOrPosition;
    }
}

export class CodeAction {
    title: string;
    kind?: CodeActionKind;
    diagnostics?: Diagnostic[];
    isPreferred?: boolean;
    edit?: WorkspaceEdit;
    command?: Command;

    constructor(title: string, kind?: CodeActionKind) {
        this.title = title;
        this.kind = kind;
    }
}

export class WorkspaceEdit {
    private _edits = new Map<string, TextEdit[]>();

    set(uri: Uri, edits: TextEdit[]): void {
        this._edits.set(uri.toString(), edits);
    }

    get(uri: Uri): TextEdit[] {
        return this._edits.get(uri.toString()) || [];
    }

    has(uri: Uri): boolean {
        return this._edits.has(uri.toString());
    }

    entries(): [Uri, TextEdit[]][] {
        return Array.from(this._edits.entries()).map(([uriStr, edits]) => [Uri.parse(uriStr), edits]);
    }

    replace(uri: Uri, range: Range, newText: string): void {
        const edits = this._edits.get(uri.toString()) || [];
        edits.push(TextEdit.replace(range, newText));
        this._edits.set(uri.toString(), edits);
    }

    insert(uri: Uri, position: Position, newText: string): void {
        const edits = this._edits.get(uri.toString()) || [];
        edits.push(TextEdit.insert(position, newText));
        this._edits.set(uri.toString(), edits);
    }

    delete(uri: Uri, range: Range): void {
        const edits = this._edits.get(uri.toString()) || [];
        edits.push(TextEdit.delete(range));
        this._edits.set(uri.toString(), edits);
    }
}

export class TextEdit {
    range: Range;
    newText: string;

    constructor(range: Range, newText: string) {
        this.range = range;
        this.newText = newText;
    }

    static replace(range: Range, newText: string): TextEdit {
        return new TextEdit(range, newText);
    }

    static insert(position: Position, newText: string): TextEdit {
        return new TextEdit(new Range(position, position), newText);
    }

    static delete(range: Range): TextEdit {
        return new TextEdit(range, '');
    }
}

// ========================================
// 命令
// ========================================

export interface Command {
    title: string;
    command: string;
    tooltip?: string;
    arguments?: any[];
}

// ========================================
// 事件
// ========================================

export class EventEmitter<T> {
    private _listeners: ((e: T) => void)[] = [];

    event: Event<T> = (listener: (e: T) => void): Disposable => {
        this._listeners.push(listener);
        return new Disposable(() => {
            const index = this._listeners.indexOf(listener);
            if (index >= 0) {
                this._listeners.splice(index, 1);
            }
        });
    };

    fire(data: T): void {
        for (const listener of this._listeners) {
            listener(data);
        }
    }

    dispose(): void {
        this._listeners = [];
    }
}

export type Event<T> = (listener: (e: T) => void) => Disposable;

// ========================================
// Disposable
// ========================================

export class Disposable {
    private _callOnDispose: () => void;
    private _disposed = false;

    constructor(callOnDispose: () => void) {
        this._callOnDispose = callOnDispose;
    }

    static from(...disposables: { dispose(): void }[]): Disposable {
        return new Disposable(() => {
            for (const d of disposables) {
                d.dispose();
            }
        });
    }

    dispose(): void {
        if (!this._disposed) {
            this._callOnDispose();
            this._disposed = true;
        }
    }
}

// ========================================
// 状态栏
// ========================================

export interface StatusBarItem {
    alignment: StatusBarAlignment;
    priority?: number;
    text: string;
    tooltip?: string;
    color?: string;
    backgroundColor?: ThemeColor;
    command?: string | Command;
    accessibilityInformation?: { label: string; role?: string };
    name?: string;
    show(): void;
    hide(): void;
    dispose(): void;
}

export class ThemeColor {
    id: string;
    constructor(id: string) {
        this.id = id;
    }
}

// ========================================
// 配置
// ========================================

export interface WorkspaceConfiguration {
    get<T>(section: string): T | undefined;
    get<T>(section: string, defaultValue: T): T;
    has(section: string): boolean;
    inspect<T>(section: string): { key: string; defaultValue?: T; globalValue?: T; workspaceValue?: T } | undefined;
    update(section: string, value: any, configurationTarget?: boolean | ConfigurationTarget): Thenable<void>;
}

export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3,
}

// ========================================
// 取消令牌
// ========================================

export interface CancellationToken {
    isCancellationRequested: boolean;
    onCancellationRequested: Event<void>;
}

export class CancellationTokenSource {
    token: CancellationToken;
    private _isCancelled = false;
    private _emitter = new EventEmitter<void>();

    constructor() {
        this.token = {
            isCancellationRequested: false,
            onCancellationRequested: this._emitter.event,
        };
    }

    cancel(): void {
        if (!this._isCancelled) {
            this._isCancelled = true;
            (this.token as any).isCancellationRequested = true;
            this._emitter.fire();
        }
    }

    dispose(): void {
        this._emitter.dispose();
    }
}

// ========================================
// 输出通道
// ========================================

export interface OutputChannel {
    name: string;
    append(value: string): void;
    appendLine(value: string): void;
    clear(): void;
    show(preserveFocus?: boolean): void;
    show(column?: ViewColumn, preserveFocus?: boolean): void;
    hide(): void;
    dispose(): void;
}

export enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
    Two = 2,
    Three = 3,
}

// ========================================
// workspace 命名空间
// ========================================

export const workspace = {
    workspaceFolders: [] as WorkspaceFolder[],

    getWorkspaceFolder: vi.fn((_uri: Uri): WorkspaceFolder | undefined => undefined),

    getConfiguration: vi.fn((section?: string): WorkspaceConfiguration => {
        const configStore: Record<string, any> = {};
        return {
            get: vi.fn(<T>(key: string, defaultValue?: T): T | undefined => {
                const fullKey = section ? `${section}.${key}` : key;
                return configStore[fullKey] ?? defaultValue;
            }),
            has: vi.fn((key: string): boolean => {
                const fullKey = section ? `${section}.${key}` : key;
                return fullKey in configStore;
            }),
            inspect: vi.fn(),
            update: vi.fn(() => Promise.resolve()),
        };
    }),

    onDidChangeConfiguration: vi.fn(() => new Disposable(() => {})),
    onDidChangeTextDocument: vi.fn(() => new Disposable(() => {})),
    onDidOpenTextDocument: vi.fn(() => new Disposable(() => {})),
    onDidCloseTextDocument: vi.fn(() => new Disposable(() => {})),
    onDidSaveTextDocument: vi.fn(() => new Disposable(() => {})),
    onDidCreateFiles: vi.fn(() => new Disposable(() => {})),
    onDidDeleteFiles: vi.fn(() => new Disposable(() => {})),
    onDidRenameFiles: vi.fn(() => new Disposable(() => {})),

    createFileSystemWatcher: vi.fn(() => ({
        onDidCreate: vi.fn(() => new Disposable(() => {})),
        onDidChange: vi.fn(() => new Disposable(() => {})),
        onDidDelete: vi.fn(() => new Disposable(() => {})),
        dispose: vi.fn(),
    })),

    openTextDocument: vi.fn((uri: Uri) => Promise.resolve(new TextDocument(uri, '', 'yaml'))),
    applyEdit: vi.fn(() => Promise.resolve(true)),
    findFiles: vi.fn(() => Promise.resolve([])),
    fs: {
        readFile: vi.fn(() => Promise.resolve(new Uint8Array())),
        writeFile: vi.fn(() => Promise.resolve()),
        delete: vi.fn(() => Promise.resolve()),
        rename: vi.fn(() => Promise.resolve()),
        copy: vi.fn(() => Promise.resolve()),
        createDirectory: vi.fn(() => Promise.resolve()),
        stat: vi.fn(() => Promise.resolve({ type: 1, ctime: 0, mtime: 0, size: 0 })),
        readDirectory: vi.fn(() => Promise.resolve([])),
    },
};

export interface WorkspaceFolder {
    readonly uri: Uri;
    readonly name: string;
    readonly index: number;
}

// ========================================
// window 命名空间
// ========================================

export const window = {
    showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
    showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
    showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
    showQuickPick: vi.fn(() => Promise.resolve(undefined)),
    showInputBox: vi.fn(() => Promise.resolve(undefined)),

    createOutputChannel: vi.fn(
        (name: string): OutputChannel => ({
            name,
            append: vi.fn(),
            appendLine: vi.fn(),
            clear: vi.fn(),
            show: vi.fn(),
            hide: vi.fn(),
            dispose: vi.fn(),
        }),
    ),

    createStatusBarItem: vi.fn(
        (alignment?: StatusBarAlignment, priority?: number): StatusBarItem => ({
            alignment: alignment ?? StatusBarAlignment.Left,
            priority,
            text: '',
            show: vi.fn(),
            hide: vi.fn(),
            dispose: vi.fn(),
        }),
    ),

    activeTextEditor: undefined as TextEditor | undefined,
    visibleTextEditors: [] as TextEditor[],
    onDidChangeActiveTextEditor: vi.fn(() => new Disposable(() => {})),
    onDidChangeVisibleTextEditors: vi.fn(() => new Disposable(() => {})),
    onDidChangeTextEditorSelection: vi.fn(() => new Disposable(() => {})),
};

export interface TextEditor {
    readonly document: TextDocument;
    selection: Selection;
    selections: readonly Selection[];
    readonly visibleRanges: readonly Range[];
    readonly options: TextEditorOptions;
    edit(callback: (editBuilder: TextEditorEdit) => void): Thenable<boolean>;
    insertSnippet(snippet: SnippetString, location?: Position | Range): Thenable<boolean>;
    revealRange(range: Range, revealType?: TextEditorRevealType): void;
}

export interface TextEditorOptions {
    tabSize?: number | string;
    insertSpaces?: boolean | string;
    cursorStyle?: TextEditorCursorStyle;
    lineNumbers?: TextEditorLineNumbersStyle;
}

export interface TextEditorEdit {
    replace(location: Position | Range | Selection, value: string): void;
    insert(location: Position, value: string): void;
    delete(location: Range | Selection): void;
}

export enum TextEditorRevealType {
    Default = 0,
    InCenter = 1,
    InCenterIfOutsideViewport = 2,
    AtTop = 3,
}

export enum TextEditorCursorStyle {
    Line = 1,
    Block = 2,
    Underline = 3,
}

export enum TextEditorLineNumbersStyle {
    Off = 0,
    On = 1,
    Relative = 2,
}

// ========================================
// Selection
// ========================================

export class Selection extends Range {
    anchor: Position;
    active: Position;

    constructor(anchor: Position, active: Position);
    constructor(anchorLine: number, anchorCharacter: number, activeLine: number, activeCharacter: number);
    constructor(
        anchorOrAnchorLine: Position | number,
        activeOrAnchorCharacter: Position | number,
        activeLine?: number,
        activeCharacter?: number,
    ) {
        if (typeof anchorOrAnchorLine === 'number') {
            const anchor = new Position(anchorOrAnchorLine, activeOrAnchorCharacter as number);
            const active = new Position(activeLine!, activeCharacter!);
            super(anchor, active);
            this.anchor = anchor;
            this.active = active;
        } else {
            super(anchorOrAnchorLine, activeOrAnchorCharacter as Position);
            this.anchor = anchorOrAnchorLine;
            this.active = activeOrAnchorCharacter as Position;
        }
    }

    get isReversed(): boolean {
        return this.anchor.isAfter(this.active);
    }
}

// ========================================
// commands 命名空间
// ========================================

export const commands = {
    registerCommand: vi.fn((_command: string, _callback: (...args: any[]) => any) => new Disposable(() => {})),
    executeCommand: vi.fn(
        <T>(_command: string, ..._args: any[]): Thenable<T | undefined> => Promise.resolve(undefined),
    ),
    getCommands: vi.fn(() => Promise.resolve([])),
};

// ========================================
// languages 命名空间
// ========================================

export const languages = {
    registerCompletionItemProvider: vi.fn(() => new Disposable(() => {})),
    registerHoverProvider: vi.fn(() => new Disposable(() => {})),
    registerDefinitionProvider: vi.fn(() => new Disposable(() => {})),
    registerReferenceProvider: vi.fn(() => new Disposable(() => {})),
    registerCodeActionsProvider: vi.fn(() => new Disposable(() => {})),
    registerDocumentSymbolProvider: vi.fn(() => new Disposable(() => {})),
    registerWorkspaceSymbolProvider: vi.fn(() => new Disposable(() => {})),
    createDiagnosticCollection: vi.fn((name?: string) => ({
        name: name || 'default',
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        forEach: vi.fn(),
        get: vi.fn(),
        has: vi.fn(),
        dispose: vi.fn(),
    })),
    getDiagnostics: vi.fn(() => []),
    onDidChangeDiagnostics: vi.fn(() => new Disposable(() => {})),
    match: vi.fn(() => 0),
};

// ========================================
// extensions 命名空间
// ========================================

export const extensions = {
    getExtension: vi.fn(() => undefined),
    all: [],
    onDidChange: vi.fn(() => new Disposable(() => {})),
};

// ========================================
// debug 命名空间
// ========================================

export const debug = {
    activeDebugConsole: {
        append: vi.fn(),
        appendLine: vi.fn(),
    },
    activeDebugSession: undefined,
    breakpoints: [],
    onDidChangeActiveDebugSession: vi.fn(() => new Disposable(() => {})),
    onDidStartDebugSession: vi.fn(() => new Disposable(() => {})),
    onDidTerminateDebugSession: vi.fn(() => new Disposable(() => {})),
};

// ========================================
// 默认导出
// ========================================

export default {
    Uri,
    Position,
    Range,
    Selection,
    TextDocument,
    Location,
    Diagnostic,
    DiagnosticSeverity,
    DiagnosticRelatedInformation,
    CompletionItem,
    CompletionItemKind,
    CompletionTriggerKind,
    CompletionList,
    MarkdownString,
    SnippetString,
    CodeAction,
    CodeActionKind,
    WorkspaceEdit,
    TextEdit,
    EventEmitter,
    Disposable,
    CancellationTokenSource,
    ThemeColor,
    StatusBarAlignment,
    ConfigurationTarget,
    ViewColumn,
    TextEditorRevealType,
    TextEditorCursorStyle,
    TextEditorLineNumbersStyle,
    EndOfLine,
    workspace,
    window,
    commands,
    languages,
    extensions,
    debug,
};
