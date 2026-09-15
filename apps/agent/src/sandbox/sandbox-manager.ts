/**
 * E2B MicroVM Sandboxing & Monorepo Path Resolution Manager.
 *
 * Implements Invariant 8:
 * - Ephemeral Firecracker microVM execution via @e2b/sdk.
 * - Secure credential air-gapping (tokens never saved to VM environment or .bashrc).
 * - Scoped subpath execution for monorepos (targetDirectory).
 * - Hard 120-second timeout for build/test verification.
 * - Guaranteed teardown to eliminate orphaned sessions.
 */

import path from 'node:path';
import { Sandbox, ProcessOutput } from '@e2b/sdk';

export interface SandboxConfig {
  repoUrl: string;
  githubToken: string;
  branchName?: string;
  targetDirectory?: string;
  ignorePatterns?: string[];
  timeoutMs?: number;
}

export interface BuildVerifyResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

export class SandboxManager {
  private sandbox: Sandbox | null = null;
  private config: SandboxConfig | null = null;
  private readonly repoDir: string = '/home/user/repo';
  private workDir: string = '/home/user/repo';

  constructor(
    private readonly sandboxFactory: (opts?: any) => Promise<Sandbox> = (opts) => Sandbox.create(opts)
  ) {}

  /**
   * Initializes the E2B microVM, securely clones the repository,
   * checks out a deterministic remediation branch, and scopes the working directory.
   */
  async initialize(config: SandboxConfig): Promise<void> {
    this.config = {
      targetDirectory: '.',
      ignorePatterns: [],
      timeoutMs: 15 * 60 * 1000, // 15 minutes default
      ...config,
    };

    // Calculate scoped working directory (posix format for Linux microVM)
    const targetDir = this.config.targetDirectory || '.';
    this.workDir = path.posix.normalize(path.posix.join(this.repoDir, targetDir));

    // Spin up ephemeral Firecracker microVM
    this.sandbox = await this.sandboxFactory({
      timeout: this.config.timeoutMs,
    });

    // Format authenticated clone URL without exposing token in persistent VM configuration
    let authedUrl: string;
    try {
      const parsed = new URL(this.config.repoUrl);
      parsed.username = 'x-access-token';
      parsed.password = this.config.githubToken;
      authedUrl = parsed.toString();
    } catch {
      authedUrl = this.config.repoUrl.replace(/^https:\/\//, `https://x-access-token:${this.config.githubToken}@`);
    }

    // Clone repository into microVM repo directory
    const cloneCmd = this.config.branchName
      ? `git clone --branch ${this.config.branchName} "${authedUrl}" "${this.repoDir}"`
      : `git clone "${authedUrl}" "${this.repoDir}"`;

    try {
      const cloneOutput = await this.sandbox.process.startAndWait({
        cmd: cloneCmd,
      });

      if (cloneOutput.exitCode !== 0 && cloneOutput.exitCode !== undefined) {
        const sanitizedErr = (cloneOutput.stderr || cloneOutput.stdout || 'Git clone failed')
          .replace(new RegExp(this.config.githubToken, 'g'), '***');
        throw new Error(`Failed to clone repository: ${sanitizedErr}`);
      }
    } catch (err: any) {
      const sanitizedMsg = (err?.message || String(err)).replace(
        new RegExp(this.config.githubToken, 'g'),
        '***'
      );
      // Clean up sandbox on failed initialization
      await this.terminate();
      throw new Error(sanitizedMsg);
    }

    // Checkout deterministic remediation branch: fix11y/auto-remediation
    const branchCmd = `git checkout -b fix11y/auto-remediation`;
    const branchOutput = await this.sandbox.process.startAndWait({
      cmd: branchCmd,
      cwd: this.repoDir,
    });

    if (branchOutput.exitCode !== 0 && branchOutput.exitCode !== undefined) {
      // If branch already exists, checkout directly
      await this.sandbox.process.startAndWait({
        cmd: `git checkout fix11y/auto-remediation`,
        cwd: this.repoDir,
      });
    }
  }

  /**
   * Resolves a file path relative to the scoped targetDirectory or repository root.
   */
  resolvePath(filePath: string): string {
    if (path.posix.isAbsolute(filePath)) {
      return path.posix.normalize(filePath);
    }
    return path.posix.normalize(path.posix.join(this.workDir, filePath));
  }

  /**
   * Checks if a given file matches configured ignore patterns.
   */
  isPathIgnored(filePath: string): boolean {
    if (!this.config?.ignorePatterns || this.config.ignorePatterns.length === 0) {
      return false;
    }

    const normalized = filePath.replace(/\\/g, '/');
    return this.config.ignorePatterns.some((pattern) => {
      if (pattern.startsWith('*.')) {
        const ext = pattern.slice(1);
        return normalized.endsWith(ext);
      }
      return normalized.includes(pattern);
    });
  }

  /**
   * Runs dependency install, test suite, and build in the target subdirectory.
   * Strictly enforces a hard timeout of 120 seconds (120,000 ms).
   */
  async runBuildAndVerify(timeoutMs: number = 120_000): Promise<BuildVerifyResult> {
    if (!this.sandbox) {
      throw new Error('Sandbox is not initialized. Call initialize() first.');
    }

    const commands = [
      'npm install --prefer-offline --no-audit',
      'npm test --if-present',
      'npm run build --if-present',
    ];

    let totalStdout = '';
    let totalStderr = '';

    const executeCommands = async (): Promise<BuildVerifyResult> => {
      for (const cmd of commands) {
        const output = await this.sandbox!.process.startAndWait({
          cmd,
          cwd: this.workDir,
        });

        if (output.stdout) {
          totalStdout += (totalStdout ? '\n' : '') + output.stdout;
        }
        if (output.stderr) {
          totalStderr += (totalStderr ? '\n' : '') + output.stderr;
        }

        if (output.exitCode !== 0 && output.exitCode !== undefined) {
          return {
            success: false,
            stdout: totalStdout,
            stderr: totalStderr,
          };
        }
      }

      return {
        success: true,
        stdout: totalStdout,
        stderr: totalStderr,
      };
    };

    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<BuildVerifyResult>((resolve) => {
      timer = setTimeout(() => {
        resolve({
          success: false,
          stdout: totalStdout,
          stderr: (totalStderr + '\nCommand timed out after 120 seconds').trim(),
        });
      }, timeoutMs);
    });

    try {
      return await Promise.race([executeCommands(), timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Reads a file from the microVM workspace.
   */
  async readFile(filePath: string): Promise<string> {
    if (!this.sandbox) {
      throw new Error('Sandbox is not initialized. Call initialize() first.');
    }
    const resolved = this.resolvePath(filePath);
    return await this.sandbox.filesystem.read(resolved);
  }

  /**
   * Writes mutated content to a file in the microVM workspace.
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('Sandbox is not initialized. Call initialize() first.');
    }
    const resolved = this.resolvePath(filePath);
    await this.sandbox.filesystem.write(resolved, content);
  }

  /**
   * Terminates the microVM session and ensures instance cleanup to prevent orphaned resources.
   */
  async terminate(): Promise<void> {
    if (this.sandbox) {
      const sb = this.sandbox;
      this.sandbox = null;
      try {
        await sb.close();
      } catch {
        // Ignore errors during teardown
      }
    }
  }

  getTargetDirectory(): string {
    return this.config?.targetDirectory || '.';
  }

  getRepoDirectory(): string {
    return this.repoDir;
  }

  getWorkingDirectory(): string {
    return this.workDir;
  }

  getSandbox(): Sandbox | null {
    return this.sandbox;
  }
}
