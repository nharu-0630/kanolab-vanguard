import gitDiff from 'git-diff';
import * as os from 'os';
import * as vscode from 'vscode';
import { HashChainLogger } from '../utils/HashChainLogger';
import { VService } from './VService';

class DiffLogger {
    private filePath: string;
    private previousContent: string = '';
    private logger: HashChainLogger;

    private LOGGER_SUFFIX = '.diff.log';

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
    name = '差分ロガー';

    private diffLoggers: Map<string, DiffLogger> = new Map();
    private diffIntervalId: NodeJS.Timeout | undefined;
    private disposable: vscode.Disposable | undefined;

    private DIFF_INTERVAL_MS = 10000;
    private ALLOWED_EXTENSION = ['.txt', '.py'];

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
        return this.diffLoggers.has(fileName);
    }

    register(fileName: string): void {
        if (this.diffLoggers.has(fileName)) {
            return;
        }
        this.diffLoggers.set(fileName, new DiffLogger(fileName));
    }

    cleanup(): void {
        if (this.disposable) {
            this.disposable.dispose();
        }
        if (this.diffIntervalId) {
            clearInterval(this.diffIntervalId);
            this.diffIntervalId = undefined;
        }
    }

    getTooltip(): string {
        return `差分ロガー: ${this.diffLoggers.size}ファイル`;
    }
}
