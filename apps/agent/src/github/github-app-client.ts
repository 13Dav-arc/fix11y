/**
 * GitHub App Authentication Client.
 *
 * Implements ephemeral token minting via @octokit/auth-app and provides
 * repository-scoped Octokit instances for git and REST operations.
 */

import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

export interface GitHubAppConfig {
  appId?: string | number;
  privateKey?: string;
  installationId?: number;
}

export class GitHubAppClient {
  public readonly appId: string | number;
  public readonly privateKey: string;
  public readonly installationId?: number;

  constructor(config: GitHubAppConfig = {}) {
    this.appId = config.appId || process.env.GITHUB_APP_ID || '';
    // Normalize newlines in PEM private keys
    this.privateKey = (config.privateKey || process.env.GITHUB_APP_PRIVATE_KEY || '').replace(
      /\\n/g,
      '\n'
    );
    this.installationId =
      config.installationId ||
      (process.env.GITHUB_APP_INSTALLATION_ID
        ? Number(process.env.GITHUB_APP_INSTALLATION_ID)
        : undefined);
  }

  /**
   * Generates a short-lived repository-scoped installation access token on the fly.
   */
  async getInstallationToken(
    installationId?: number,
    repositoryNames?: string[]
  ): Promise<string> {
    const instId = installationId || this.installationId;
    if (!instId) {
      throw new Error('Missing installationId for GitHub App token authentication');
    }
    if (!this.appId || !this.privateKey) {
      throw new Error('Missing appId or privateKey for GitHub App authentication');
    }

    const auth = createAppAuth({
      appId: this.appId,
      privateKey: this.privateKey,
      installationId: instId,
    });

    const tokenAuth = await auth({
      type: 'installation',
      installationId: instId,
      repositoryNames,
    });

    return tokenAuth.token;
  }

  /**
   * Returns an authenticated Octokit instance scoped to the installation.
   */
  getInstallationOctokit(installationId?: number): Octokit {
    const instId = installationId || this.installationId;
    if (!instId) {
      throw new Error('Missing installationId for GitHub App Octokit instance');
    }
    if (!this.appId || !this.privateKey) {
      throw new Error('Missing appId or privateKey for GitHub App Octokit instance');
    }

    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.appId,
        privateKey: this.privateKey,
        installationId: instId,
      },
    });
  }
}

export function createGitHubAppClient(config?: GitHubAppConfig): GitHubAppClient {
  return new GitHubAppClient(config);
}
