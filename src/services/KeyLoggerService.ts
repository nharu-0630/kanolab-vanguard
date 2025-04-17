import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { VService } from './VService';

export class KeyLoggerService implements VService {
    name = 'キーロガー';

    private keydownFileNames: Map<string, string> = new Map();
    private keydownTimestamp: Map<string, number> = new Map();
    private disposable: vscode.Disposable | undefined;

    private ALLOWED_EXTENSION = ['.txt', '.py'];
    private LOGGER_SUFFIX = '.key.log';

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

            const logFileName = this.keydownFileNames.get(fileName);
            if (!logFileName || event.contentChanges.length === 0) {
                return;
            }

            const timestamp = Date.now();
            const lastKeydownTimestamp = this.keydownTimestamp.get(fileName) || timestamp;
            const elapsed = timestamp - lastKeydownTimestamp;
            this.keydownTimestamp.set(fileName, timestamp);

            event.contentChanges.forEach(change => {
                const inputText = change.text;
                const rangeLength = change.rangeLength;
                const deletedText = rangeLength > 0 ? `${rangeLength}文字削除` : '';
                const logEntry = `[${new Date(timestamp).toISOString()}][${path.basename(fileName)}] ` +
                    `キー: "${inputText.replace(/\n/g, '\\n')}" ` +
                    `${deletedText ? `削除: "${deletedText}" ` : ''}` +
                    `位置: L${change.range.start.line + 1}:C${change.range.start.character + 1} ` +
                    `間隔: ${elapsed}ms\n`;
                fs.appendFileSync(logFileName, logEntry);
            });
        });
    }

    isSupported(fileName: string): boolean {
        return this.ALLOWED_EXTENSION.some(ext => fileName.endsWith(ext));
    }

    isActive(fileName: string): boolean {
        return this.keydownFileNames.has(fileName);
    }

    register(fileName: string): void {
        if (this.keydownFileNames.has(fileName)) {
            return;
        }

        const logFilePath = fileName + this.LOGGER_SUFFIX;

        const header = `=== キーロガー開始: ${new Date().toISOString()} ===\n` +
            `ファイル: ${fileName}\n` +
            `OS: ${os.platform()} ${os.release()}\n` +
            `ホスト名: ${os.hostname()}\n` +
            `ユーザー名: ${os.userInfo().username}\n\n` +
            `形式: [タイムスタンプ][ファイル名] キー: "入力テキスト" 削除: "削除内容" 位置: L行:C列 間隔: ミリ秒\n\n`;
        fs.writeFileSync(logFilePath, header);

        this.keydownFileNames.set(fileName, logFilePath);
        this.keydownTimestamp.set(fileName, Date.now());
    }

    cleanup(): void {
        if (this.disposable) {
            this.disposable.dispose();
        }
        this.keydownFileNames.clear();
        this.keydownTimestamp.clear();
    }

    getTooltip(): string {
        return `キーロガー: ${this.keydownFileNames.size}ファイル`;
    }
}
