import * as vscode from 'vscode';
import { VService } from './VService';

export class ServiceManager {
    private static instance: ServiceManager;
    private isEnabled: boolean = false;
    private services: VService[] = [];
    private statusBarItem: vscode.StatusBarItem;

    private constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'kanolab-vanguard.toggle';
        this.statusBarItem.show();
    }

    public static getInstance(): ServiceManager {
        if (!ServiceManager.instance) {
            ServiceManager.instance = new ServiceManager();
        }
        return ServiceManager.instance;
    }

    public registerService(service: VService): void {
        this.services.push(service);
    }

    public start(): void {
        this.isEnabled = true;
        this.services.forEach(service => {
            service.enable();
        });
        this.updateStatusBar();
    }

    public stop(): void {
        this.isEnabled = false;
        this.services.forEach(service => {
            service.disable();
        });
        this.updateStatusBar();
    }

    public isRunning(): boolean {
        return this.isEnabled;
    }

    public getStatusBarItem(): vscode.StatusBarItem {
        return this.statusBarItem;
    }

    public updateStatusBar(): void {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            this.statusBarItem.text = "$(shield) 待機中";
            this.statusBarItem.color = "yellow";
            this.statusBarItem.tooltip = "ファイルが選択されていません";
            return;
        }

        const document = editor.document;
        const fileName = document.fileName;

        if (document.isUntitled) {
            this.statusBarItem.text = "$(shield) 停止中";
            this.statusBarItem.color = "red";
            this.statusBarItem.tooltip = "ファイルを保存してください";
            return;
        }

        const activeServices = this.services.filter(s => s.isActive(fileName));
        this.statusBarItem.text = "$(shield) " + activeServices.length + " / " + this.services.length + " サービス";
        this.statusBarItem.color = activeServices.length > 0 ? "green" : "red";
        this.statusBarItem.tooltip = this.services.map(s => s.getTooltip()).join('\n');
    }

    public registerDocument(document: vscode.TextDocument): void {
        const fileName = document.fileName;

        if (document.isUntitled) {
            return;
        }

        this.services.forEach(s => {
            if (s.isSupported(fileName)) {
                s.register(fileName);
            }
        });

        this.updateStatusBar();
    }

    public cleanupServices(): void {
        this.services.forEach(s => s.cleanup());
    }
}