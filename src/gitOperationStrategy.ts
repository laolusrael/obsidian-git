import type { SimpleGit } from "simple-git";

export interface GitOperationStrategy {
    getRepoPath(): string;
    getVaultPath(): string;
    toRepoPath(vaultPath: string): string;
    toVaultPath(repoPath: string): string;
    isDefault(): boolean;
}

export class DefaultStrategy implements GitOperationStrategy {
    constructor(
        private repoPath: string,
        private vaultPath: string
    ) {}

    getRepoPath(): string {
        return this.repoPath;
    }

    getVaultPath(): string {
        return this.vaultPath;
    }

    toRepoPath(vaultPath: string): string {
        return vaultPath;
    }

    toVaultPath(repoPath: string): string {
        return repoPath;
    }

    isDefault(): boolean {
        return true;
    }
}

export class MultiRepoStrategy implements GitOperationStrategy {
    constructor(
        private repoPath: string,
        private vaultPath: string
    ) {}

    getRepoPath(): string {
        return this.repoPath;
    }

    getVaultPath(): string {
        return this.vaultPath;
    }

    toRepoPath(vaultPath: string): string {
        // Convert vault-relative to repo-relative
        if (vaultPath.startsWith(this.vaultPath)) {
            const relative = vaultPath.substring(this.vaultPath.length + 1);
            if (relative.startsWith(this.repoPath)) {
                return relative.substring(this.repoPath.length + 1);
            }
            // vaultPath is relative to vault, convert to be relative to this repo
            return relative;
        }
        return vaultPath;
    }

    toVaultPath(repoPath: string): string {
        // Convert repo-relative to vault-relative
        return `${this.repoPath}/${repoPath}`;
    }

    isDefault(): boolean {
        return false;
    }
}
