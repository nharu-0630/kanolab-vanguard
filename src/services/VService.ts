
export interface VService {
    isSupported(fileName: string): boolean;
    register(fileName: string): void;
    isActive(fileName: string): boolean;
    cleanup(): void;
    getTooltip(): string;
    enable(): void;
    disable(): void;
}
