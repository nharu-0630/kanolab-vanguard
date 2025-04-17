import gitDiff from 'git-diff';
import * as os from 'os';
import * as vscode from 'vscode';
import { HashChainLogger } from '../utils/HashChainLogger';
import { VService } from './VService';

class DiffLogger {
    private filePath: string;
    private previousContent: string = '';
    private logger: HashChainLogger;

    private readonly LOGGER_SUFFIX = '.diff.log';

    constructor(filePath: string) {
        this.filePath = filePath + this.LOGGER_SUFFIX;
        this.logger = new HashChainLogger(this.filePath);
        this.logger.append(`[${Date.now()}] file: "${filePath}" os: "${os.platform()} ${os.release()}" hostname: "${os.hostname()}" username: "${os.userInfo().username}"`);
    }

    setContent(content: string): void {
        const diff = gitDiff(this.previousContent, content);
        this.previousContent = content;
        if (diff) {
            this.logger.append(`[${Date.now()}] diff: "${diff.replace(/\n/g, '\\n')}"`);
        }
    }
}

export class DiffLoggerService implements VService {
    public readonly name = '差分ロガー';

    private diffLoggers: Map<string, DiffLogger> = new Map();
    private diffIntervalId: NodeJS.Timeout | undefined;
    private disposable: vscode.Disposable | undefined;
    private isEnabled: boolean = false;

    private readonly DIFF_INTERVAL_MS = 10000;
    private readonly ALLOWED_EXTENSION = ['.txt', '.py'];

    constructor() {
        this.setup();
    }

    private setup(): void {
    }

    private startTracking(): void {
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

    private stopTracking(): void {
        if (this.diffIntervalId) {
            clearInterval(this.diffIntervalId);
            this.diffIntervalId = undefined;
        }

        if (this.disposable) {
            this.disposable.dispose();
            this.disposable = undefined;
        }
    }

    private trackDiff(): void {
        if (!this.isEnabled) { return; }

        const editors = vscode.window.visibleTextEditors;
        editors.forEach(editor => {
            const document = editor.document;
            const fileName = document.fileName;
            if (!this.isSupported(fileName) || !this.diffLoggers.has(fileName)) {
                return;
            }
            const diffLogger = this.diffLoggers.get(fileName);
            if (!diffLogger) {
                return;
            }
            diffLogger.setContent(document.getText());
        });
    }

    isSupported(fileName: string): boolean {
        return this.ALLOWED_EXTENSION.some(ext => fileName.endsWith(ext));
    }

    isActive(fileName: string): boolean {
        return this.isEnabled && this.diffLoggers.has(fileName);
    }

    register(fileName: string): void {
        if (!this.isEnabled) {
            vscode.window.showInformationMessage('差分ロガーが無効になっています。有効にしてから登録してください。');
            return;
        }

        if (this.diffLoggers.has(fileName)) {
            return;
        }

        const diffLogger = new DiffLogger(fileName);
        this.diffLoggers.set(fileName, diffLogger);

        const document = vscode.workspace.textDocuments.find(doc => doc.fileName === fileName);
        if (document) {
            diffLogger.setContent(document.getText());
        }
    }

    cleanup(): void {
        this.stopTracking();
        this.diffLoggers.clear();
    }

    getTooltip(): string {
        return `差分ロガー: ${this.diffLoggers.size}ファイル (${this.isEnabled ? '有効' : '無効'})`;
    }

    enable(): void {
        if (!this.isEnabled) {
            this.isEnabled = true;
            this.startTracking();
            vscode.window.showInformationMessage('差分ロガーを有効化しました');

            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && this.isSupported(activeEditor.document.fileName)) {
                this.register(activeEditor.document.fileName);
            }
        }
    }

    disable(): void {
        if (this.isEnabled) {
            this.isEnabled = false;
            this.stopTracking();
            vscode.window.showInformationMessage('差分ロガーを無効化しました');
        }
    }

    toggle(): void {
        if (this.isEnabled) {
            this.disable();
        } else {
            this.enable();
        }
    }
}
