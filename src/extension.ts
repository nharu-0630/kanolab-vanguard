import * as vscode from 'vscode';
import { DiffLoggerService } from './services/DiffLoggerService';
import { KeyLoggerService } from './services/KeyLoggerService';
import { ServiceManager } from './services/ServiceManager';

export function activate(context: vscode.ExtensionContext) {
	const serviceManager = ServiceManager.getInstance();

	serviceManager.registerService(new KeyLoggerService());
	serviceManager.registerService(new DiffLoggerService());

	const statusBarItem = serviceManager.getStatusBarItem();
	serviceManager.updateStatusBar();

	if (vscode.window.activeTextEditor) {
		const document = vscode.window.activeTextEditor.document;
		serviceManager.registerDocument(document);
	}

	const onSaveDisposable = vscode.workspace.onDidSaveTextDocument(document => {
		serviceManager.registerDocument(document);
	});

	const onEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(editor => {
		serviceManager.updateStatusBar();
		if (editor && !editor.document.isUntitled) {
			serviceManager.registerDocument(editor.document);
		}
	});

	const onEditorCloseDisposable = vscode.workspace.onDidCloseTextDocument(_ => {
		serviceManager.updateStatusBar();
	});

	context.subscriptions.push(
		statusBarItem,
		onSaveDisposable,
		onEditorChangeDisposable,
		onEditorCloseDisposable
	);
}

export function deactivate() {
	ServiceManager.getInstance().cleanupServices();
}
