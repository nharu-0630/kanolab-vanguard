import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import { HashChainLogger } from '../utils/HashChainLogger';
import { VService } from './VService';

export class BrowserLoggerService implements VService {
    name = 'ブラウザロガー';

    private logger: HashChainLogger | undefined;

    private command: string = "";
    private platform: string = os.platform();
    private isWSL: boolean = false;

    private browserIntervalId: NodeJS.Timeout | undefined;
    private disposable: vscode.Disposable | undefined;

    private lastNotified: number = 0;

    private DIFF_INTERVAL_MS = 1000;
    private DETECTION_KEYWORDS = ['chatgpt', 'chat.openai.com'];

    constructor() {
        this.setup();
    }

    private setup(): void {
        const currentDir = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!currentDir) {
            throw new Error('No workspace folder found.');
        }
        this.logger = new HashChainLogger(currentDir + '/browser.log');
        this.logger.append(`[${Date.now()}] os: "${os.platform()} ${os.release()}" hostname: "${os.hostname()}" username: "${os.userInfo().username}"`);

        if (this.browserIntervalId) {
            clearInterval(this.browserIntervalId);
        }

        if (this.platform === 'linux') {
            try {
                const procVersion = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
                this.isWSL = procVersion.includes('microsoft') || procVersion.includes('wsl');
            } catch (error) {
                console.error('WSL検出エラー:', error);
            }
        }

        if (this.platform === 'win32') {
            this.command = 'tasklist /fo csv /nh';
        } else if (this.platform === 'darwin') {
            this.command = 'ps -axo pid,comm';
        } else if (this.platform === 'linux') {
            this.command = 'ps -axo pid,comm';
        } else {
            vscode.window.showErrorMessage(`未対応のプラットフォームです: ${os.platform}`);
            return;
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
    }

    private trackBrowser(): void {
        exec(this.command, (error, stdout, stderr) => {
            if (error) {
                console.error(`プロセス一覧取得エラー: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`stderr: ${stderr}`);
                return;
            }

            this.checkForChatGPTUsage(stdout);
        });
    }

    private checkForChatGPTUsage(processes: string) {
        let browserDetected = false;

        const chromeKeywords = ['chrome', 'google chrome', 'chromium'];
        const firefoxKeywords = ['firefox', 'mozilla'];
        const edgeKeywords = ['msedge', 'microsoft edge'];
        const safariKeywords = ['safari'];
        const allBrowserKeywords = [...chromeKeywords, ...firefoxKeywords, ...edgeKeywords, ...safariKeywords];

        for (const keyword of allBrowserKeywords) {
            if (processes.toLowerCase().includes(keyword)) {
                browserDetected = true;
                break;
            }
        }

        if (this.isWSL && !browserDetected) {
            const windowsCommand = 'powershell.exe -Command "Get-Process | Where-Object { $_.Name -match \'chrome|firefox|edge|iexplore|opera\' } | Select-Object Name | Format-Table -HideTableHeaders"';

            exec(windowsCommand, (error, stdout) => {
                if (!error && stdout) {
                    for (const keyword of allBrowserKeywords) {
                        if (stdout.toLowerCase().includes(keyword)) {
                            browserDetected = true;
                            this.checkWindowsBrowserTabs();
                            break;
                        }
                    }
                }
            });
            return;
        }

        if (this.platform === 'win32') {
            exec('tasklist /v /fo csv /nh', (error, stdout) => {
                if (error) {
                    return;
                }
                this.detectChatGPTInWindowTitles(stdout);
            });
        } else if (this.platform === 'darwin') {
            const scriptForChrome = `
                osascript -e 'tell application "Google Chrome" to get URL of active tab of front window'
            `;
            exec(scriptForChrome, (error, stdout) => {
                if (!error && stdout) {
                    this.detectChatGPTInURL(stdout);
                }
            });

            const scriptForSafari = `
                osascript -e 'tell application "Safari" to get URL of current tab of front window'
            `;
            exec(scriptForSafari, (error, stdout) => {
                if (!error && stdout) {
                    this.detectChatGPTInURL(stdout);
                }
            });

            const scriptForFirefox = `
                osascript -e 'tell application "Firefox" to get URL of active tab of front window'
            `;
            exec(scriptForFirefox, (error, stdout) => {
                if (!error && stdout) {
                    this.detectChatGPTInURL(stdout);
                }
            });
        } else if (this.platform === 'linux' && !this.isWSL) {
            exec('ps aux | grep -E "firefox|chrome|chromium|edge" | grep -v grep', (error, stdout) => {
                if (error) {
                    return;
                }
                this.detectChatGPTInProcessInfo(stdout);
                exec('xdotool getwindowfocus getwindowname', (err, output) => {
                    if (!err && output) {
                        this.detectChatGPTInWindowTitles(output);
                    }
                });
            });
        }
    }

    private checkWindowsBrowserTabs() {
        const powershellCommand = `powershell.exe -Command "Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and ($_.Name -match 'chrome|firefox|edge|iexplore|opera') } | Select-Object MainWindowTitle | Format-Table -HideTableHeaders"`;
        exec(powershellCommand, (error, stdout) => {
            if (error) {
                console.error('Windows側ブラウザタイトル取得エラー:', error);
                return;
            }
            if (stdout) {
                this.detectChatGPTInWindowTitles(stdout);
            }
        });
    }

    private detectChatGPTInWindowTitles(windowInfo: string) {
        for (const keyword of this.DETECTION_KEYWORDS) {
            if (windowInfo.toLowerCase().includes(keyword)) {
                this.notifyChatGPTDetected();
                return;
            }
        }
    }

    private detectChatGPTInURL(url: string) {
        for (const keyword of this.DETECTION_KEYWORDS) {
            if (url.toLowerCase().includes(keyword)) {
                this.notifyChatGPTDetected();
                return;
            }
        }
    }

    private detectChatGPTInProcessInfo(processInfo: string) {
        for (const keyword of this.DETECTION_KEYWORDS) {
            if (processInfo.toLowerCase().includes(keyword)) {
                this.notifyChatGPTDetected();
                return;
            }
        }
    }

    private notifyChatGPTDetected() {
        const timestamp = Date.now();
        if (timestamp - this.lastNotified > 15000) {
            vscode.window.showWarningMessage('ChatGPT detected in browser!');
            this.logger?.append(`[${timestamp}] ChatGPT detected in browser!`);
            this.lastNotified = timestamp;
        }
    }

    isSupported(fileName: string): boolean {
        return true;
    }

    isActive(fileName: string): boolean {
        return true;
    }

    register(fileName: string): void {
        return;
    }

    cleanup(): void {
        if (this.disposable) {
            this.disposable.dispose();
        }
        if (this.browserIntervalId) {
            clearInterval(this.browserIntervalId);
            this.browserIntervalId = undefined;
        }
    }

    getTooltip(): string {
        return `ブラウザロガー`;
    }
}
