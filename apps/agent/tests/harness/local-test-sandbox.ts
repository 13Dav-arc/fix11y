/**
 * Disk-Backed Local Test Sandbox Harness.
 *
 * Implements the SandboxManager contract using the local filesystem,
 * allowing real surgical CST file modifications, monorepo pathing,
 * and deterministic build verification without requiring E2B microVMs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SandboxManager, SandboxConfig, BuildVerifyResult } from '../../src/sandbox/sandbox-manager.js';

export interface LocalSandboxOptions {
  workspaceDir: string;
  simulateBuildFailure?: boolean;
  buildFailureMessage?: string;
}

export class LocalTestSandbox extends SandboxManager {
  private localWorkspaceDir: string;
  private localWorkDir: string;
  private localConfig: SandboxConfig | null = null;
  private buildSuccess = true;
  private buildStderr = '';

  constructor(options: LocalSandboxOptions) {
    // Pass dummy factory to super since we don't connect to remote E2B
    super(async () => null as any);
    this.localWorkspaceDir = path.resolve(options.workspaceDir);
    this.localWorkDir = this.localWorkspaceDir;
    if (options.simulateBuildFailure) {
      this.buildSuccess = false;
      this.buildStderr = options.buildFailureMessage || 'Build verification failed: syntax error';
    }
  }

  override async initialize(config: SandboxConfig): Promise<void> {
    this.localConfig = {
      targetDirectory: '.',
      ignorePatterns: [],
      ...config,
    };

    const targetDir = this.localConfig.targetDirectory || '.';
    this.localWorkDir = path.resolve(this.localWorkspaceDir, targetDir);

    if (!fs.existsSync(this.localWorkDir)) {
      fs.mkdirSync(this.localWorkDir, { recursive: true });
    }
  }

  override async readFile(filePath: string): Promise<string> {
    const resolved = this.resolveLocalPath(filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found in local sandbox: ${filePath} (${resolved})`);
    }
    return fs.readFileSync(resolved, 'utf8');
  }

  override async writeFile(filePath: string, content: string): Promise<void> {
    const resolved = this.resolveLocalPath(filePath);
    const parent = path.dirname(resolved);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
    fs.writeFileSync(resolved, content, 'utf8');
  }

  override async runBuildAndVerify(_timeoutMs = 120_000): Promise<BuildVerifyResult> {
    if (!this.buildSuccess) {
      return {
        success: false,
        stdout: '',
        stderr: this.buildStderr,
      };
    }

    return {
      success: true,
      stdout: 'Simulated build, test, and package verification passed cleanly.',
      stderr: '',
    };
  }

  override isPathIgnored(filePath: string): boolean {
    const patterns = this.localConfig?.ignorePatterns || [];
    const normalized = filePath.replace(/\\/g, '/');
    return patterns.some((pattern) => {
      const cleanPattern = pattern.replace(/^\*\*/, '').replace(/^\//, '');
      return normalized.includes(cleanPattern);
    });
  }

  override async terminate(): Promise<void> {
    // Local sandbox requires no remote termination
  }

  override getTargetDirectory(): string {
    return this.localConfig?.targetDirectory || '.';
  }

  override getRepoDirectory(): string {
    return this.localWorkspaceDir;
  }

  override getWorkingDirectory(): string {
    return this.localWorkDir;
  }

  setBuildSuccess(success: boolean, stderr = ''): void {
    this.buildSuccess = success;
    this.buildStderr = stderr;
  }

  private resolveLocalPath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.localWorkDir, filePath);
  }
}

// Preserve constructor name for checkpointer serialization filter
Object.defineProperty(LocalTestSandbox, 'name', { value: 'SandboxManager' });
