import { existsSync, statSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { SHA3 } from 'sha3';

export class HashChainLogger {
    private static readonly sha3 = new SHA3(256);
    private readonly filePath: string;

    constructor(filePath: string) {
        this.filePath = path.resolve(filePath);
    }

    public async append(entry: string): Promise<void> {
        await this.ensureFileExists();

        try {
            const release = await lockfile.lock(this.filePath, {
                retries: { retries: 5, minTimeout: 100 }
            });

            try {
                const latestHash = await this.getLatestHash();

                const prefixedEntry = latestHash ? entry : `* ${entry}`;
                const newHash = HashChainLogger.calculateHash(prefixedEntry, latestHash);

                await fs.appendFile(
                    this.filePath,
                    `${prefixedEntry}\n${newHash}\n`
                );
            } finally {
                await release();
            }
        } catch (error) {
            throw new Error(`Failed to append to log: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async ensureFileExists(): Promise<void> {
        if (!existsSync(this.filePath)) {
            const dir = path.dirname(this.filePath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(this.filePath, '');
        } else if (!statSync(this.filePath).isFile()) {
            throw new Error(`Path ${this.filePath} exists but is not a file.`);
        }
    }

    private async getLatestHash(): Promise<string> {
        try {
            const content = await fs.readFile(this.filePath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim() !== '');
            return lines.length > 0 ? lines[lines.length - 1].trim() : '';
        } catch (error) {
            throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private static calculateHash(entry: string, previousHash: string): string {
        const hash = new SHA3(256);
        return hash.update(`${entry}${previousHash}`).digest('hex');
    }
}
