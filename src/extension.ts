import * as vscode from 'vscode';
import { startDiffInterval } from './diffLogger';
import { setupKeyLogger } from './keyLogger';
import { setupStatusBar, updateStatusBarForCurrentFile } from './statusBar';
import { isAllowedFileName } from './utils';

export function activate(context: vscode.ExtensionContext) {
	const statusBarItem = setupStatusBar();
	updateStatusBarForCurrentFile();

	if (vscode.window.activeTextEditor) {
		const document = vscode.window.activeTextEditor.document;
		if (isAllowedFileName(document.fileName) && !document.isUntitled) {
			updateFilepath(document);
		}
	}

	const keyLoggerDisposable = setupKeyLogger();

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
		updateStatusBarForCurrentFile();
	});

	const diffIntervalDisposable = startDiffInterval();

	context.subscriptions.push(
		keyLoggerDisposable,
		onSaveDisposable,
		onEditorChangeDisposable,
		onEditorCloseDisposable,
		statusBarItem,
		diffIntervalDisposable
	);
}

function updateFilepath(document: vscode.TextDocument) {
	if (document.isUntitled) {
		return;
	}

	const fileName = document.fileName;
	if (!isAllowedFileName(fileName)) {
		return;
	}

	try {
		const keyLogFilePath = fileName + ".key.log";
		const diffLogFilePath = fileName + ".diff.log";

		const { initKeyLogFile, registerFile: registerKeyLogFile } = require('./keyLogger');
		const { initDiffLogFile, registerDiffFile } = require('./diffLogger');

		initKeyLogFile(fileName, keyLogFilePath);
		registerKeyLogFile(fileName, keyLogFilePath);

		initDiffLogFile(fileName, diffLogFilePath);
		registerDiffFile(fileName, diffLogFilePath, document.getText());

		updateStatusBarForCurrentFile();
	} catch (error) {
		vscode.window.showErrorMessage(`ファイルの作成に失敗しました: ${error}`);
		const { updateStatusBarError } = require('./statusBar');
		updateStatusBarError("ファイルの作成に失敗しました");
	}
}

export function deactivate() {
	const { cleanupDiffLogger } = require('./diffLogger');
	const { cleanupKeyLogger } = require('./keyLogger');

	cleanupDiffLogger();
	cleanupKeyLogger();
}
