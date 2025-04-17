import * as fs from 'fs';

export enum Platform {
    Windows = 'windows',
    Darwin = 'darwin',
    Linux = 'linux',
    WSL = 'wsl',
    Unknown = 'unknown'
}

export function getPlatform(): Platform {
    const platform = process.platform;
    if (platform === 'win32') {
        return Platform.Windows;
    } else if (platform === 'darwin') {
        return Platform.Darwin;
    } else if (platform === 'linux') {
        if (fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('wsl')) {
            return Platform.WSL;
        }
        return Platform.Linux;
    } else {
        return Platform.Unknown;
    }
}