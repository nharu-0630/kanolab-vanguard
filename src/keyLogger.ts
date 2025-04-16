import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { isAllowedFileName } from './utils';

let keydownFileNames: Map<string, string> = new Map();
let keydownTimestamp: Map<string, number> = new Map();

export function setupKeyLogger(): vscode.Disposable {
    return vscode.workspace.onDidChangeTextDocument(event => {
        const document = event.document;
        const fileName = document.fileName;

        if (!isAllowedFileName(fileName)) {
            return;
        }

        const logFileName = keydownFileNames.get(fileName);
        if (!logFileName || event.contentChanges.length === 0) {
            return;
        }

        const timestamp = Date.now();
        const lastKeydownTimestamp = keydownTimestamp.get(fileName) || timestamp;
        const elapsed = timestamp - lastKeydownTimestamp;
        keydownTimestamp.set(fileName, timestamp);

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

export function initKeyLogFile(fileName: string, logFilePath: string) {
    const header = `=== キーロガー開始: ${new Date().toISOString()} ===\n` +
        `ファイル: ${fileName}\n` +
        `OS: ${os.platform()} ${os.release()}\n` +
        `ホスト名: ${os.hostname()}\n` +
        `ユーザー名: ${os.userInfo().username}\n\n` +
        `形式: [タイムスタンプ][ファイル名] キー: "入力テキスト" 削除: "削除内容" 位置: L行:C列 間隔: ミリ秒\n\n`;

    fs.writeFileSync(logFilePath, header);
}

export function registerFile(fileName: string, logFilePath: string) {
    keydownFileNames.set(fileName, logFilePath);
    keydownTimestamp.set(fileName, Date.now());
}

export function isFileRegistered(fileName: string): boolean {
    return keydownFileNames.has(fileName);
}

export function cleanupKeyLogger() {
    keydownFileNames.clear();
    keydownTimestamp.clear();
}
