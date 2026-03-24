import type { FileSystemAdapter } from "obsidian";
import * as fs from "fs/promises";
import * as path from "path";
import type ObsidianGit from "./main";

export interface DiscoveredRepo {
    path: string;
    name: string;
    enabled: boolean;
}

export class RepoManager {
    private repos: Map<string, DiscoveredRepo> = new Map();
    private readonly plugin: ObsidianGit;

    constructor(plugin: ObsidianGit) {
        this.plugin = plugin;
    }

    async discoverRepos(): Promise<DiscoveredRepo[]> {
        const adapter = this.plugin.app.vault.adapter as FileSystemAdapter;
        const vaultBasePath = adapter.getBasePath();
        const basePath = this.getBasePath(vaultBasePath);

        this.repos.clear();
        await this.scanForGitFolders(basePath, vaultBasePath);

        return this.getAllRepos();
    }

    private getBasePath(vaultBasePath: string): string {
        if (this.plugin.settings.basePath) {
            return path.join(vaultBasePath, this.plugin.settings.basePath);
        }
        return vaultBasePath;
    }

    private async scanForGitFolders(
        dirPath: string,
        vaultBasePath: string
    ): Promise<void> {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    if (entry.name === ".git") {
                        const repoPath = path.dirname(fullPath);
                        const relativePath = path.relative(
                            vaultBasePath,
                            repoPath
                        );
                        const name = relativePath || "root";

                        this.repos.set(repoPath, {
                            path: repoPath,
                            name: name === "" ? "root" : name,
                            enabled: true,
                        });
                    } else if (!entry.name.startsWith(".")) {
                        await this.scanForGitFolders(fullPath, vaultBasePath);
                    }
                }
            }
        } catch {
            // Ignore permission errors or non-existent directories
        }
    }

    getAllRepos(): DiscoveredRepo[] {
        return Array.from(this.repos.values());
    }

    getRepoForFile(filePath: string): DiscoveredRepo | null {
        const adapter = this.plugin.app.vault.adapter as FileSystemAdapter;
        const vaultBasePath = adapter.getBasePath();
        const basePath = this.getBasePath(vaultBasePath);
        const absoluteFilePath = path.join(basePath, filePath);

        let closestRepo: DiscoveredRepo | null = null;
        let longestMatchLength = 0;

        for (const repo of this.repos.values()) {
            if (absoluteFilePath.startsWith(repo.path)) {
                const matchLength = repo.path.length;
                if (matchLength > longestMatchLength) {
                    longestMatchLength = matchLength;
                    closestRepo = repo;
                }
            }
        }

        if (closestRepo && closestRepo.enabled) {
            return closestRepo;
        }

        return null;
    }

    isFileInAnyRepo(filePath: string): boolean {
        return this.getRepoForFile(filePath) !== null;
    }

    getRepoByPath(repoPath: string): DiscoveredRepo | undefined {
        return this.repos.get(repoPath);
    }

    setRepoEnabled(repoPath: string, enabled: boolean): void {
        const repo = this.repos.get(repoPath);
        if (repo) {
            repo.enabled = enabled;
        }
    }

    getEnabledRepos(): DiscoveredRepo[] {
        return this.getAllRepos().filter((repo) => repo.enabled);
    }

    async reload(): Promise<DiscoveredRepo[]> {
        return this.discoverRepos();
    }

    get reposCount(): number {
        return this.repos.size;
    }

    get enabledReposCount(): number {
        return this.getEnabledRepos().length;
    }
}
