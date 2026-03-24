import type { FileSystemAdapter } from "obsidian";
import * as fs from "fs/promises";
import * as path from "path";
import type ObsidianGit from "./main";
import type { GitOperationStrategy } from "./gitOperationStrategy";
import { DefaultStrategy, MultiRepoStrategy } from "./gitOperationStrategy";

export interface DiscoveredRepo {
    path: string;
    name: string;
    enabled: boolean;
}

export class RepoManager {
    private repos: Map<string, DiscoveredRepo> = new Map();
    private readonly plugin: ObsidianGit;
    private strategies: Map<string, GitOperationStrategy> = new Map();
    private defaultStrategy: GitOperationStrategy;

    constructor(plugin: ObsidianGit) {
        this.plugin = plugin;
        // Initialize default strategy to vault root
        const adapter = this.plugin.app.vault.adapter as FileSystemAdapter;
        const vaultBasePath = adapter.getBasePath();
        this.defaultStrategy = new DefaultStrategy(
            vaultBasePath,
            vaultBasePath
        );
    }

    async discoverRepos(): Promise<DiscoveredRepo[]> {
        const adapter = this.plugin.app.vault.adapter as FileSystemAdapter;
        const vaultBasePath = adapter.getBasePath();
        const basePath = this.getBasePath(vaultBasePath);

        console.log("[RepoManager] Scanning for repos:", {
            vaultBasePath,
            basePath,
        });

        this.repos.clear();
        this.strategies.clear();
        await this.scanForGitFolders(basePath, vaultBasePath);

        // Create strategies for all discovered repos
        for (const repo of this.repos.values()) {
            this.strategies.set(
                repo.path,
                new MultiRepoStrategy(repo.path, vaultBasePath)
            );
        }

        // Update default strategy to point to first discovered repo
        const allRepos = this.getAllRepos();
        if (allRepos.length > 0) {
            this.defaultStrategy = new DefaultStrategy(
                allRepos[0].path,
                vaultBasePath
            );
        }

        console.log("[RepoManager] Discovered repos:", this.getAllRepos());
        return this.getAllRepos();
    }

    getStrategyForRepo(repoPath: string): GitOperationStrategy {
        return this.strategies.get(repoPath) || this.defaultStrategy;
    }

    getDefaultStrategy(): GitOperationStrategy {
        return this.defaultStrategy;
    }

    hasMultipleRepos(): boolean {
        return this.repos.size > 1;
    }

    getStrategyForFile(filePath: string): GitOperationStrategy {
        const repo = this.getRepoForFile(filePath);
        if (repo) {
            return this.strategies.get(repo.path) || this.defaultStrategy;
        }
        return this.defaultStrategy;
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
