import * as path from 'path';
import * as vscode from 'vscode';
import { isFileRegistered } from './keyLogger';
import { isAllowedFileName } from './utils';

let statusBarItem: vscode.StatusBarItem;

export function setupStatusBar(): vscode.StatusBarItem {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(keyboard) 待機中";
    statusBarItem.tooltip = "待機中です";
    statusBarItem.show();
    return statusBarItem;
}

export function updateStatusBarForCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        statusBarItem.text = "$(keyboard) 待機中";
        statusBarItem.tooltip = "ファイルが選択されていません";
        return;
    }

    const document = editor.document;
    const fileName = document.fileName;

    if (document.isUntitled) {
        statusBarItem.text = "$(warning) 停止中: ファイル未保存";
        statusBarItem.tooltip = "ファイルを保存してください";
        return;
    }

    if (!isAllowedFileName(fileName)) {
        statusBarItem.text = "$(warning) 停止中: ファイル形式非対応";
        statusBarItem.tooltip = "このファイル形式は対応していません";
        return;
    }

    if (isFileRegistered(fileName)) {
        statusBarItem.text = "$(keyboard) 動作中";
        statusBarItem.tooltip = `${path.basename(fileName)}`;
    } else {
        statusBarItem.text = "$(keyboard) 待機中";
        statusBarItem.tooltip = "ファイルの編集を開始してください";
    }
}

export function updateStatusBarError(message: string) {
    statusBarItem.text = "$(error) エラー";
    statusBarItem.tooltip = message;
}
