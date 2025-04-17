import * as fs from 'fs';
import gitDiff from 'git-diff';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { VService } from './VService';

export class DiffLoggerService implements VService {
    name = '差分ロガー';

    private diffFileNames: Map<string, string> = new Map();
    private diffCache: Map<string, string> = new Map();
    private diffIntervalId: NodeJS.Timeout | undefined;
    private disposable: vscode.Disposable | undefined;

    private DIFF_INTERVAL_MS = 10000;
    private ALLOWED_EXTENSION = ['.txt', '.py'];
    private LOGGER_SUFFIX = '.diff.log';

    constructor() {
        this.setup();
    }

    private setup(): void {
        if (this.diffIntervalId) {
            clearInterval(this.diffIntervalId);
        }

        this.diffIntervalId = setInterval(() => {
            this.trackDiff();
        }, this.DIFF_INTERVAL_MS);

        this.disposable = {
            dispose: () => {
                if (this.diffIntervalId) {
                    clearInterval(this.diffIntervalId);
                    this.diffIntervalId = undefined;
                }
            }
        };
    }

    private trackDiff(): void {
        const editors = vscode.window.visibleTextEditors;
        editors.forEach(editor => {
            const document = editor.document;
            const fileName = document.fileName;

            if (!this.isSupported(fileName) || !this.diffFileNames.has(fileName)) {
                return;
            }

            const diffFileName = this.diffFileNames.get(fileName);
            if (!diffFileName) {
                return;
            }

            const currentContent = document.getText();
            const cachedContent = this.diffCache.get(fileName) || '';
            const diff = gitDiff(cachedContent, currentContent);

            if (diff) {
                const timestamp = Date.now();
                const diffEntry = `[${new Date(timestamp).toISOString()}][${path.basename(fileName)}] ` +
                    `差分: "${diff.replace(/\n/g, '\\n')}"\n`;
                fs.appendFileSync(diffFileName, diffEntry);
                this.diffCache.set(fileName, currentContent);
            }
        });
    }

    isSupported(fileName: string): boolean {
        return this.ALLOWED_EXTENSION.some(ext => fileName.endsWith(ext));
    }

    isActive(fileName: string): boolean {
        return this.diffFileNames.has(fileName);
    }

    register(fileName: string): void {
        if (this.diffFileNames.has(fileName)) {
            return;
        }

        const logFilePath = fileName + this.LOGGER_SUFFIX;
        const document = vscode.window.activeTextEditor?.document;
        const initialContent = document?.fileName === fileName ? document.getText() : '';

        const header = `=== 差分ログ開始: ${new Date().toISOString()} ===\n` +
            `ファイル: ${fileName}\n` +
            `OS: ${os.platform()} ${os.release()}\n` +
            `ホスト名: ${os.hostname()}\n` +
            `ユーザー名: ${os.userInfo().username}\n\n` +
            `形式: [タイムスタンプ][ファイル名] 差分: "差分内容"\n\n`;
        fs.writeFileSync(logFilePath, header);

        this.diffFileNames.set(fileName, logFilePath);
        this.diffCache.set(fileName, initialContent);
    }

    cleanup(): void {
        if (this.disposable) {
            this.disposable.dispose();
        }
        if (this.diffIntervalId) {
            clearInterval(this.diffIntervalId);
            this.diffIntervalId = undefined;
        }
        this.diffFileNames.clear();
        this.diffCache.clear();
    }

    getTooltip(): string {
        return `差分ロガー: ${this.diffFileNames.size}ファイル`;
    }
}
