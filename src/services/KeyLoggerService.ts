import * as os from 'os';
import * as vscode from 'vscode';
import { HashChainLogger } from '../utils/HashChainLogger';
import { VService } from './VService';

class KeyLogger {
    private filePath: string;
    private timestamp: number;
    private logger: HashChainLogger;

    private LOGGER_SUFFIX = '.key.log';

    constructor(filePath: string) {
        this.filePath = filePath + this.LOGGER_SUFFIX;
        this.timestamp = Date.now();
        this.logger = new HashChainLogger(this.filePath);
        this.logger.append(`[${this.timestamp}] file: "${filePath}" os: "${os.platform()} ${os.release()}" hostname: "${os.hostname()}" username: "${os.userInfo().username}"`);
    }

    append(event: vscode.TextDocumentChangeEvent) {
        if (event.contentChanges.length === 0) {
            return;
        }

        const timestamp = Date.now();
        const elapsed = timestamp - this.timestamp;
        this.timestamp = timestamp;

        event.contentChanges.forEach(change => {
            let action = "append";
            if (change.text === "") {
                action = "delete";
            } else if (change.rangeLength > 0) {
                action = "replace";
            }
            this.logger.append(`[${timestamp}] ${action}: "${change.text.replace(/\n/g, '\\n')}" ` +
                `(L${change.range.start.line + 1}:C${change.range.start.character + 1} - ` +
                `L${change.range.end.line + 1}:C${change.range.end.character + 1}) ` +
                `interval: ${elapsed}ms`);
        });
    }
}

export class KeyLoggerService implements VService {
    name = 'キーロガー';

    private keyLoggers: Map<string, KeyLogger> = new Map();
    private disposable: vscode.Disposable | undefined;

    private ALLOWED_EXTENSION = ['.txt', '.py'];

    constructor() {
        this.setup();
    }

    private setup(): void {
        this.disposable = vscode.workspace.onDidChangeTextDocument(event => {
            const document = event.document;
            const fileName = document.fileName;

            if (!this.isSupported(fileName)) {
                return;
            }

            const keyLogger = this.keyLoggers.get(fileName);
            if (!keyLogger) {
                return;
            }
            keyLogger.append(event);
        });
    }

    isSupported(fileName: string): boolean {
        return this.ALLOWED_EXTENSION.some(ext => fileName.endsWith(ext));
    }

    isActive(fileName: string): boolean {
        return this.keyLoggers.has(fileName);
    }

    register(fileName: string): void {
        if (this.keyLoggers.has(fileName)) {
            return;
        }
        this.keyLoggers.set(fileName, new KeyLogger(fileName));
    }

    cleanup(): void {
        if (this.disposable) {
            this.disposable.dispose();
        }
    }

    getTooltip(): string {
        return `キーロガー: ${this.keyLoggers.size}ファイル`;
    }
}
