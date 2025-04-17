import * as vscode from 'vscode';
import { VMonitor } from './VMonitor';

export class VMonitorManager {
    private static instance: VMonitorManager;
    private monitors: VMonitor[] = [];
    private statusBarItem: vscode.StatusBarItem;

    private constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.show();
    }

    public static getInstance(): VMonitorManager {
        if (!VMonitorManager.instance) {
            VMonitorManager.instance = new VMonitorManager();
        }
        return VMonitorManager.instance;
    }

    public registerMonitor(monitor: VMonitor): void {
        this.monitors.push(monitor);
    }

    public getMonitors(): VMonitor[] {
        return this.monitors;
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

        const activatedMonitors = this.monitors.filter(monitor => monitor.isActive(fileName));
        const deactivatedMonitors = this.monitors.filter(monitor => !monitor.isActive(fileName));

        if (activatedMonitors.length > 0) {
            this.statusBarItem.text = "$(check) " + activatedMonitors.length + "動作中 " + "$(warning) " + deactivatedMonitors.length + "停止中";
        } else {
            this.statusBarItem.text = "$(warning) 停止中";
        }
        this.statusBarItem.tooltip = this.monitors.map(m => m.getTooltip()).join('\n');
    }

    public registerDocument(document: vscode.TextDocument): void {
        const fileName = document.fileName;

        if (document.isUntitled) {
            return;
        }

        this.monitors.forEach(monitor => {
            if (monitor.isSupported(fileName)) {
                monitor.register(fileName);
            }
        });

        this.updateStatusBar();
    }

    public cleanupAllMonitors(): void {
        this.monitors.forEach(monitor => monitor.cleanup());
    }
}
