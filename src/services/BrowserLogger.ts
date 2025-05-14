import { exec } from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';
import { HashChainLogger } from '../utils/HashChainLogger';
import { getPlatform, Platform } from '../utils/Platform';
import { VService } from './VService';


export class BrowserLoggerService implements VService {
    private logger: HashChainLogger | undefined;
    private platform: Platform = getPlatform();
    private browserIntervalId: NodeJS.Timeout | undefined;
    private disposable: vscode.Disposable | undefined;
    private lastNotified: number = 0;
    private isEnabled: boolean = false;

    private readonly DIFF_INTERVAL_MS = 5000;
    private readonly DETECTION_KEYWORDS = ['chatgpt', 'chat.openai.com', 'claude', 'gemini', 'perplexity', 'copilot', 'deepseek', 'notebooklm', 'grok'];

    constructor() {
        this.setup();
    }

    private setup(): void {
    }

    private startTracking(): void {
        if (this.disposable) {
            this.disposable.dispose();
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

        if (!this.logger) {
            const currentDir = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
            if (!currentDir) {
                throw new Error('No workspace folder found.');
            }

            this.logger = new HashChainLogger(currentDir + '/browser.log');
            const systemInfo = `[${Date.now()}] os: "${os.platform()} ${os.release()}" hostname: "${os.hostname()}" username: "${os.userInfo().username}"`;
            this.logger.append(systemInfo);
            this.logger.append(`[${Date.now()}] Detected platform: ${this.platform}`);
        }
    }

    private stopTracking(): void {
        if (this.disposable) {
            this.disposable.dispose();
        }
    }

    private trackBrowser(): void {
        if (!this.isEnabled) { return; }
        if (this.platform === Platform.Windows) {
            this.verifyWindowsBrowserActivity();
        } else if (this.platform === Platform.WSL) {
            this.verifyWSLBrowserActivity();
        } else if (this.platform === Platform.Darwin) {
            this.verifyDarwinBrowserActivity();
        } else if (this.platform === Platform.Linux) {
            this.verifyLinuxBrowserActivity();
        }
    }

    private verifyWindowsBrowserActivity(): void {
        exec(`cmd.exe /c powershell.exe -NoLogo -NonInteractive -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Process | Where-Object { $_.ProcessName -in @('chrome', 'msedge', 'firefox') -and $_.MainWindowTitle -ne '' } | ForEach-Object { $_.MainWindowTitle }"`, { windowsHide: false, encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) {
                return;
            }
            if (stderr) {
                this.logger?.append(`[${Date.now()}] check stderr: ${stderr}`);
                return;
            }
            if (!this.detectKeywords(stdout)) {
                this.logger?.append(`[${Date.now()}] No detection keywords found in browser`);
            }
        });
    }

    private verifyWSLBrowserActivity(): void {
        exec(`cmd.exe /c powershell.exe -NoLogo -NonInteractive -Command '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Process | Where-Object { $_.ProcessName -in @("chrome", "msedge", "firefox") -and $_.MainWindowTitle -ne "" } | ForEach-Object { $_.MainWindowTitle }'`, { windowsHide: false, encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) {
                return;
            }
            if (stderr) {
                this.logger?.append(`[${Date.now()}] check stderr: ${stderr}`);
                return;
            }
            if (!this.detectKeywords(stdout)) {
                this.logger?.append(`[${Date.now()}] No detection keywords found in browser`);
            }
        });
    }

    private verifyDarwinBrowserActivity(): void {
        const scripts = {
            'Google Chrome.app': 'tell application "Google Chrome" to get URL of active tab of front window',
            'Safari.app/Contents/MacOS/Safari': 'tell application "Safari" to get URL of current tab of front window',
        };
        let found = false;
        for (const [app, script] of Object.entries(scripts)) {
            exec(`pgrep -f "${app}"`, (error, stdout, stderr) => {
                if (error) {
                    return;
                }
                if (stderr) {
                    this.logger?.append(`[${Date.now()}] check stderr: ${stderr}`);
                    return;
                }
                if (stdout.length === 0) {
                    return;
                }
                exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
                    if (error) {
                        return;
                    }
                    if (stderr) {
                        this.logger?.append(`[${Date.now()}] check stderr: ${stderr}`);
                        return;
                    }
                    found = found || this.detectKeywords(stdout);
                });
            });
        }
        if (!found) {
            this.logger?.append(`[${Date.now()}] No detection keywords found in browser`);
        }
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
            if (!this.detectKeywords(stdout)) {
                this.logger?.append(`[${Date.now()}] No detection keywords found in browser`);
            }
        });
    }

    private detectKeywords(lines: string): boolean {
        const timestamp = Date.now();
        let found = false;
        for (const line of lines.split('\n')) {
            if (line.trim() === '') { continue; }
            const value = line.trim().toLowerCase();
            for (const keyword of this.DETECTION_KEYWORDS) {
                if (value.includes(keyword)) {
                    found = true;
                    this.logger?.append(`[${timestamp}] Detected keyword in browser: ${keyword} in ${line}`);
                    this.notifyDetectedAlert();
                    break;
                }
            }
        }
        return found;
    }

    private notifyDetectedAlert() {
        const timestamp = Date.now();
        if (timestamp - this.lastNotified > 15000) {
            vscode.window.showWarningMessage('ブラウザ上での生成AIの使用が検出されました。');
            this.logger?.append(`[${timestamp}] Generative AI detected in browser!`);
            this.lastNotified = timestamp;
        }
    }

    isSupported(_: string): boolean {
        return true;
    }

    isActive(_: string): boolean {
        return this.isEnabled;
    }

    register(_: string): void {
        return;
    }

    cleanup(): void {
        this.stopTracking();
    }

    getTooltip(): string {
        return `ブラウザロガー: ${this.isEnabled ? '有効' : '無効'}`;
    }

    enable(): void {
        if (!this.isEnabled) {
            this.isEnabled = true;
            this.startTracking();
            this.logger?.append(`[${Date.now()}] Browser logger enabled`);
        }
    }

    disable(): void {
        if (this.isEnabled) {
            this.isEnabled = false;
            this.stopTracking();
            this.logger?.append(`[${Date.now()}] Browser logger disabled`);
        }
    }
}
