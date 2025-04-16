import * as fs from 'fs';
import gitDiff from 'git-diff';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

let keydownFileNames: Map<string, string> = new Map();
let keydownTimestamp: Map<string, number> = new Map();
let diffFileNames: Map<string, string> = new Map();
let diffCache: Map<string, string> = new Map();
let statusBarItem: vscode.StatusBarItem;
let diffIntervalId: NodeJS.Timeout | undefined;

const ALLOWED_EXTENSION = ['.txt', '.py'];
const DIFF_INTERVAL_MS = 30000; // 30 seconds

function isAllowedFileName(fileName: string): boolean {
	return ALLOWED_EXTENSION.some(ext => fileName.endsWith(ext));
}

export function activate(context: vscode.ExtensionContext) {
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = "$(keyboard) 待機中";
	statusBarItem.tooltip = "待機中です";
	statusBarItem.show();

	// 初期状態の更新
	updateStatusBarForCurrentFile();

	if (vscode.window.activeTextEditor) {
		updateFilepath(vscode.window.activeTextEditor.document);
	}

	const keyLoggerDisposable = vscode.workspace.onDidChangeTextDocument(event => {
		const document = event.document;
		const fileName = document.fileName;
		if (!isAllowedFileName(fileName)) {
			return;
		}
		updateFilepath(document);
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

	const onSaveDisposable = vscode.workspace.onDidSaveTextDocument(document => {
		if (isAllowedFileName(document.fileName)) {
			updateFilepath(document);
		}
	});

	const onEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(editor => {
		updateStatusBarForCurrentFile();
		if (editor && isAllowedFileName(editor.document.fileName)) {
			updateFilepath(editor.document);
		}
	});

	const onEditorCloseDisposable = vscode.workspace.onDidCloseTextDocument(document => {
		const fileName = document.fileName;
		if (keydownFileNames.has(fileName)) {
			keydownFileNames.delete(fileName);
			keydownTimestamp.delete(fileName);
		}
		if (diffFileNames.has(fileName)) {
			diffFileNames.delete(fileName);
			diffCache.delete(fileName);
		}
		updateStatusBarForCurrentFile();
	});

	startDiffInterval();

	context.subscriptions.push(keyLoggerDisposable);
	context.subscriptions.push(onSaveDisposable);
	context.subscriptions.push(onEditorChangeDisposable);
	context.subscriptions.push(onEditorCloseDisposable);
	context.subscriptions.push(statusBarItem);
	context.subscriptions.push({
		dispose: () => {
			if (diffIntervalId) {
				clearInterval(diffIntervalId);
				diffIntervalId = undefined;
			}
		}
	});
}

function updateStatusBarForCurrentFile() {
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

	if (keydownFileNames.has(fileName)) {
		statusBarItem.text = "$(keyboard) 動作中";
		statusBarItem.tooltip = `${path.basename(fileName)}`;
	} else {
		statusBarItem.text = "$(keyboard) 待機中";
		statusBarItem.tooltip = "ファイルの編集を開始してください";
	}
}

function updateFilepath(document: vscode.TextDocument) {
	if (document.isUntitled) {
		return;
	}

	const fileName = document.fileName;
	if (!ALLOWED_EXTENSION.some(ext => fileName.endsWith(ext))) {
		return;
	}

	if (keydownFileNames.has(fileName)) {
		return;
	}

	try {
		initKeyLogFile(fileName, fileName + ".key.log");
		keydownFileNames.set(fileName, fileName + ".key.log");
		keydownTimestamp.set(fileName, Date.now());

		initDiffLogFile(fileName, fileName + ".diff.log");
		diffFileNames.set(fileName, fileName + ".diff.log");
		diffCache.set(fileName, document.getText());

		updateStatusBarForCurrentFile();
	} catch (error) {
		vscode.window.showErrorMessage(`ファイルの作成に失敗しました: ${error}`);
		statusBarItem.text = "$(error) エラー";
		statusBarItem.tooltip = "ファイルの作成に失敗しました";
	}
}

function initKeyLogFile(fileName: string, logFilePath: string) {
	const header = `=== キーロガー開始: ${new Date().toISOString()} ===\n` +
		`ファイル: ${fileName}\n` +
		`OS: ${os.platform()} ${os.release()}\n` +
		`ホスト名: ${os.hostname()}\n` +
		`ユーザー名: ${os.userInfo().username}\n\n` +
		`形式: [タイムスタンプ][ファイル名] キー: "入力テキスト" 削除: "削除内容" 位置: L行:C列 間隔: ミリ秒\n\n`;
	fs.writeFileSync(logFilePath, header);
}

function initDiffLogFile(fileName: string, logFilePath: string) {
	const header = `=== 差分ログ開始: ${new Date().toISOString()} ===\n` +
		`ファイル: ${fileName}\n` +
		`OS: ${os.platform()} ${os.release()}\n` +
		`ホスト名: ${os.hostname()}\n` +
		`ユーザー名: ${os.userInfo().username}\n\n` +
		`形式: [タイムスタンプ][ファイル名] 差分: "差分内容"\n\n`;
	fs.writeFileSync(logFilePath, header);
}

function startDiffInterval() {
	if (diffIntervalId) {
		clearInterval(diffIntervalId);
	}
	diffIntervalId = setInterval(() => {
		trackDiff();
	}, DIFF_INTERVAL_MS);
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
		const diff = gitDiff(diffCache.get(fileName) || '', document.getText());
		if (diff) {
			const timestamp = Date.now();
			const diffEntry = `[${new Date(timestamp).toISOString()}][${path.basename(fileName)}] ` +
				`差分: "${diff.replace(/\n/g, '\\n')}"\n`;
			fs.appendFileSync(diffFileName, diffEntry);
		}
	});
}

export function deactivate() {
	if (diffIntervalId) {
		clearInterval(diffIntervalId);
		diffIntervalId = undefined;
	}
	keydownFileNames.clear();
	keydownTimestamp.clear();
	diffFileNames.clear();
	diffCache.clear();
}
