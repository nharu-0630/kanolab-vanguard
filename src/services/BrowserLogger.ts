import { exec } from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';
import { HashChainLogger } from '../utils/HashChainLogger';
import { getPlatform, Platform } from '../utils/Platform';
import { VService } from './VService';


export class BrowserLoggerService implements VService {
    public readonly name = 'ブラウザロガー';

    private logger: HashChainLogger | undefined;
    private platform: Platform = getPlatform();
    private browserIntervalId: NodeJS.Timeout | undefined;
    private disposable: vscode.Disposable | undefined;
    private lastNotified: number = 0;
    private isEnabled: boolean = false;

    private readonly DIFF_INTERVAL_MS = 5000;
    private readonly DETECTION_KEYWORDS = ['chatgpt', 'chat.openai.com', 'claude', 'gemini', 'perplexity', 'copilot', 'deepseek'];

    constructor() {
        this.setup();
    }

    private setup(): void {
        const currentDir = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!currentDir) {
            throw new Error('No workspace folder found.');
        }

        this.logger = new HashChainLogger(currentDir + '/browser.log');
        const systemInfo = `[${Date.now()}] os: "${os.platform()} ${os.release()}" hostname: "${os.hostname()}" username: "${os.userInfo().username}"`;
        this.logger.append(systemInfo);
        this.logger.append(`[${Date.now()}] Detected platform: ${this.platform}`);
    }

    private startTracking(): void {
        if (this.browserIntervalId) {
            clearInterval(this.browserIntervalId);
        }

        this.browserIntervalId = setInterval(() => {
            this.trackBrowser();
        }, this.DIFF_INTERVAL_MS);

        this.disposable = {
            dispose: () => {
                if (this.browserIntervalId) {
                    clearInterval(this.browserIntervalId);
                    this.browserIntervalId = undefined;
                }
            }
        };

        this.logger?.append(`[${Date.now()}] Browser tracking started`);
    }

    private stopTracking(): void {
        if (this.browserIntervalId) {
            clearInterval(this.browserIntervalId);
            this.browserIntervalId = undefined;
        }

        if (this.disposable) {
            this.disposable.dispose();
        }

        this.logger?.append(`[${Date.now()}] Browser tracking stopped`);
    }

    private trackBrowser(): void {
        if (!this.isEnabled) { return; }
        if (this.platform === Platform.Windows || this.platform === Platform.WSL) {
            this.verifyWindowsBrowserActivity();
        } else if (this.platform === Platform.Darwin) {
            this.verifyDarwinBrowserActivity();
        } else if (this.platform === Platform.Linux) {
            this.verifyLinuxBrowserActivity();
        }
    }

    private verifyWindowsBrowserActivity(): void {
        const command = `cmd.exe /c powershell.exe -NoLogo -NonInteractive -Command '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Process | Where-Object { $_.ProcessName -in @("chrome", "msedge", "firefox") -and $_.MainWindowTitle -ne "" } | ForEach-Object { $_.MainWindowTitle }'`;

        exec(command, { windowsHide: false, encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) {
                return;
            }
            if (stderr) {
                this.logger?.append(`[${Date.now()}] check stderr: ${stderr}`);
                return;
            }
            this.checkDetectionKeywords(stdout);
        });
    }

    private verifyDarwinBrowserActivity(): void {
        const scripts = [
            'tell application "Google Chrome" to get URL of active tab of front window',
            'tell application "Safari" to get URL of current tab of front window',
            'tell application "Firefox" to get URL of active tab of front window',
        ];
        scripts.forEach(script => {
            const command = `osascript -e '${script}'`;
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    return;
                }
                if (stderr) {
                    this.logger?.append(`[${Date.now()}] check stderr: ${stderr}`);
                    return;
                }
                this.checkDetectionKeywords(stdout);
            });
        });
    }

    private verifyLinuxBrowserActivity(): void {
        exec('ps aux | grep -E "firefox|chrome|chromium|edge" | grep -v grep', (error, stdout, stderr) => {
            if (error) {
                return;
            }
            if (stderr) {
                this.logger?.append(`[${Date.now()}] check stderr: ${stderr}`);
                return;
            }
            this.checkDetectionKeywords(stdout);
        });
    }

    private checkDetectionKeywords(value: string) {
        const timestamp = Date.now();
        for (const keyword of this.DETECTION_KEYWORDS) {
            if (value.toLowerCase().includes(keyword)) {
                this.logger?.append(`[${timestamp}] Detected keyword in browser: ${keyword}`);
                this.notifyDetectedAlert();
                return;
            }
        }
        this.logger?.append(`[${timestamp}] No detection keywords found in browser`);
    }

    private notifyDetectedAlert() {
        const timestamp = Date.now();
        if (timestamp - this.lastNotified > 15000) {
            vscode.window.showWarningMessage('Generative AI detected in browser!');
            this.logger?.append(`[${timestamp}] Generative AI detected in browser!`);
            this.lastNotified = timestamp;
        }
    }

    isSupported(fileName: string): boolean {
        return true;
    }

    isActive(fileName: string): boolean {
        return this.isEnabled;
    }

    register(fileName: string): void {
        return;
    }

    cleanup(): void {
        this.stopTracking();
    }

    getTooltip(): string {
        return `ブラウザロガー (${this.isEnabled ? '有効' : '無効'})`;
    }

    enable(): void {
        if (!this.isEnabled) {
            this.isEnabled = true;
            this.startTracking();
            vscode.window.showInformationMessage('ブラウザロガーを有効化しました');
            this.logger?.append(`[${Date.now()}] Browser logger enabled`);
        }
    }

    disable(): void {
        if (this.isEnabled) {
            this.isEnabled = false;
            this.stopTracking();
            vscode.window.showInformationMessage('ブラウザロガーを無効化しました');
            this.logger?.append(`[${Date.now()}] Browser logger disabled`);
        }
    }
}
