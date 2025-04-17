import * as vscode from 'vscode';
import { DiffLoggerMonitor } from './DiffLoggerMonitor';
import { KeyLoggerMonitor } from './KeyLoggerMonitor';
import { VMonitorManager } from './VMonitorManager';

export function activate(context: vscode.ExtensionContext) {
	const monitorManager = VMonitorManager.getInstance();

	monitorManager.registerMonitor(new KeyLoggerMonitor());
	monitorManager.registerMonitor(new DiffLoggerMonitor());

	const statusBarItem = monitorManager.getStatusBarItem();
	monitorManager.updateStatusBar();

	if (vscode.window.activeTextEditor) {
		const document = vscode.window.activeTextEditor.document;
		monitorManager.registerDocument(document);
	}

	const onSaveDisposable = vscode.workspace.onDidSaveTextDocument(document => {
		monitorManager.registerDocument(document);
	});

	const onEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(editor => {
		monitorManager.updateStatusBar();
		if (editor && !editor.document.isUntitled) {
			monitorManager.registerDocument(editor.document);
		}
	});

	const onEditorCloseDisposable = vscode.workspace.onDidCloseTextDocument(_ => {
		monitorManager.updateStatusBar();
	});

	context.subscriptions.push(
		statusBarItem,
		onSaveDisposable,
		onEditorChangeDisposable,
		onEditorCloseDisposable
	);
}

export function deactivate() {
	VMonitorManager.getInstance().cleanupAllMonitors();
}
