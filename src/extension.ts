import * as vscode from 'vscode';
import { BrowserLoggerService } from './services/BrowserLogger';
import { DiffLoggerService } from './services/DiffLoggerService';
import { KeyLoggerService } from './services/KeyLoggerService';
import { ServiceManager } from './services/ServiceManager';

export function activate(context: vscode.ExtensionContext) {
	const serviceManager = ServiceManager.getInstance();

	serviceManager.registerService(new KeyLoggerService());
	serviceManager.registerService(new DiffLoggerService());
	serviceManager.registerService(new BrowserLoggerService());

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

	const startCommandDisposable = vscode.commands.registerCommand('kanolab-vanguard.start', () => {
		serviceManager.start();
	});

	const stopCommandDisposable = vscode.commands.registerCommand('kanolab-vanguard.stop', () => {
		serviceManager.stop();
	});

	const toggleCommandDisposable = vscode.commands.registerCommand('kanolab-vanguard.toggle', () => {
		if (serviceManager.isRunning()) {
			serviceManager.stop();
		} else {
			serviceManager.start();
		}
		serviceManager.updateStatusBar();
	});

	context.subscriptions.push(
		statusBarItem,
		onSaveDisposable,
		onEditorChangeDisposable,
		onEditorCloseDisposable,
		startCommandDisposable,
		stopCommandDisposable,
		toggleCommandDisposable
	);
}

export function deactivate() {
	ServiceManager.getInstance().cleanupServices();
}