import * as vscode from 'vscode';
import { VService } from './VService';

export class ServiceManager {
    private static instance: ServiceManager;
    private services: VService[] = [];
    private statusBarItem: vscode.StatusBarItem;

    private constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
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

    public getServices(): VService[] {
        return this.services;
    }

    public getStatusBarItem(): vscode.StatusBarItem {
        return this.statusBarItem;
    }

    public updateStatusBar(): void {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            this.statusBarItem.text = "$(keyboard) 待機中";
            this.statusBarItem.tooltip = "ファイルが選択されていません";
            return;
        }

        const document = editor.document;
        const fileName = document.fileName;

        if (document.isUntitled) {
            this.statusBarItem.text = "$(warning) 停止中: ファイル未保存";
            this.statusBarItem.tooltip = "ファイルを保存してください";
            return;
        }

        const activeServices = this.services.filter(s => s.isActive(fileName));
        const inactiveServices = this.services.filter(s => !s.isActive(fileName));

        if (activeServices.length > 0) {
            this.statusBarItem.text = "$(check) " + activeServices.length + "動作中 " + "$(warning) " + inactiveServices.length + "停止中";
        } else {
            this.statusBarItem.text = "$(warning) 停止中";
        }
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
