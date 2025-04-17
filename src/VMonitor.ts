
export interface VMonitor {
    name: string;
    isSupported(fileName: string): boolean;
    register(fileName: string): void;
    isActive(fileName: string): boolean;
    cleanup(): void;
    getTooltip(): string;
}
