import * as fs from 'fs';
import gitDiff from 'git-diff';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { DIFF_INTERVAL_MS, isAllowedFileName } from './utils';

let diffFileNames: Map<string, string> = new Map();
let diffCache: Map<string, string> = new Map();
let diffIntervalId: NodeJS.Timeout | undefined;

export function setupDiffLogger() {
}

export function startDiffInterval(): vscode.Disposable {
    if (diffIntervalId) {
        clearInterval(diffIntervalId);
    }

    diffIntervalId = setInterval(() => {
        trackDiff();
    }, DIFF_INTERVAL_MS);

    return {
        dispose: () => {
            if (diffIntervalId) {
                clearInterval(diffIntervalId);
                diffIntervalId = undefined;
            }
        }
    };
}

export function initDiffLogFile(fileName: string, logFilePath: string) {
    const header = `=== 差分ログ開始: ${new Date().toISOString()} ===\n` +
        `ファイル: ${fileName}\n` +
        `OS: ${os.platform()} ${os.release()}\n` +
        `ホスト名: ${os.hostname()}\n` +
        `ユーザー名: ${os.userInfo().username}\n\n` +
        `形式: [タイムスタンプ][ファイル名] 差分: "差分内容"\n\n`;

    fs.writeFileSync(logFilePath, header);
}

export function registerDiffFile(fileName: string, logFilePath: string, initialContent: string) {
    diffFileNames.set(fileName, logFilePath);
    diffCache.set(fileName, initialContent);
}

function trackDiff() {
    const editors = vscode.window.visibleTextEditors;

    editors.forEach(editor => {
        const document = editor.document;
        const fileName = document.fileName;

        if (!isAllowedFileName(fileName) || !diffFileNames.has(fileName)) {
            return;
        }

        const diffFileName = diffFileNames.get(fileName);
        if (!diffFileName) {
            return;
        }

        const currentContent = document.getText();
        const cachedContent = diffCache.get(fileName) || '';
        const diff = gitDiff(cachedContent, currentContent);

        if (diff) {
            const timestamp = Date.now();
            const diffEntry = `[${new Date(timestamp).toISOString()}][${path.basename(fileName)}] ` +
                `差分: "${diff.replace(/\n/g, '\\n')}"\n`;

            fs.appendFileSync(diffFileName, diffEntry);

            diffCache.set(fileName, currentContent);
        }
    });
}

export function cleanupDiffLogger() {
    if (diffIntervalId) {
        clearInterval(diffIntervalId);
        diffIntervalId = undefined;
    }

    diffFileNames.clear();
    diffCache.clear();
}
