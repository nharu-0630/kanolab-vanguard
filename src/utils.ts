export const ALLOWED_EXTENSION = ['.txt', '.py'];
export const DIFF_INTERVAL_MS = 30000;

export function isAllowedFileName(fileName: string): boolean {
    return ALLOWED_EXTENSION.some(ext => fileName.endsWith(ext));
}
