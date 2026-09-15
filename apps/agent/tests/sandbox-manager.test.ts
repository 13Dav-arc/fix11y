import test from 'node:test';
import assert from 'node:assert/strict';
import { SandboxManager, SandboxConfig } from '../src/sandbox/sandbox-manager.js';

interface MockProcessOutput {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

function createMockEnvironment(options: {
  processHandler?: (opts: { cmd: string; cwd?: string }) => Promise<MockProcessOutput> | MockProcessOutput;
  files?: Record<string, string>;
  onClose?: () => Promise<void> | void;
} = {}) {
  const executedCommands: Array<{ cmd: string; cwd?: string }> = [];
  const storedFiles = new Map<string, string>(Object.entries(options.files || {}));
  let closed = false;

  const mockSandbox: any = {
    process: {
      startAndWait: async (opts: { cmd: string; cwd?: string }) => {
        executedCommands.push(opts);
        if (options.processHandler) {
          return await options.processHandler(opts);
        }
        return { exitCode: 0, stdout: 'command output', stderr: '' };
      },
    },
    filesystem: {
      read: async (path: string) => {
        if (storedFiles.has(path)) {
          return storedFiles.get(path)!;
        }
        return 'default file content';
      },
      write: async (path: string, content: string) => {
        storedFiles.set(path, content);
      },
    },
    close: async () => {
      closed = true;
      if (options.onClose) {
        await options.onClose();
      }
    },
  };

  const factory = async (_opts?: any) => mockSandbox;

  return {
    factory,
    mockSandbox,
    executedCommands,
    storedFiles,
    isClosed: () => closed,
  };
}

test('SandboxManager - initialize securely clones repository and scopes monorepo targetDirectory', async () => {
  const env = createMockEnvironment();
  const manager = new SandboxManager(env.factory);

  const config: SandboxConfig = {
    repoUrl: 'https://github.com/acme/monorepo.git',
    githubToken: 'ghp_secretToken1234567890',
    branchName: 'feature/a11y',
    targetDirectory: 'packages/ui-components',
  };

  await manager.initialize(config);

  // 1. Verify working directory is scoped to targetDirectory
  assert.equal(manager.getTargetDirectory(), 'packages/ui-components');
  assert.equal(manager.getRepoDirectory(), '/home/user/repo');
  assert.equal(manager.getWorkingDirectory(), '/home/user/repo/packages/ui-components');

  // 2. Verify git clone command injected token as x-access-token
  const cloneCommand = env.executedCommands.find((c) => c.cmd.startsWith('git clone'));
  assert.ok(cloneCommand, 'Expected git clone command to be executed');
  assert.ok(cloneCommand.cmd.includes('x-access-token:ghp_secretToken1234567890@github.com/acme/monorepo.git'));
  assert.ok(cloneCommand.cmd.includes('--branch feature/a11y'));

  // 3. Verify remediation branch checkout
  const branchCommand = env.executedCommands.find((c) => c.cmd.includes('fix11y/auto-remediation'));
  assert.ok(branchCommand, 'Expected branch checkout command to be executed');
  assert.equal(branchCommand.cwd, '/home/user/repo');
});

test('SandboxManager - initialize sanitizes token in error messages if clone fails', async () => {
  const secretToken = 'ghp_superSecretToken999';
  const env = createMockEnvironment({
    processHandler: (opts) => {
      if (opts.cmd.startsWith('git clone')) {
        return {
          exitCode: 128,
          stdout: '',
          stderr: `fatal: unable to access 'https://x-access-token:${secretToken}@github.com/org/private.git/': Authentication failed`,
        };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  });

  const manager = new SandboxManager(env.factory);

  await assert.rejects(
    async () => {
      await manager.initialize({
        repoUrl: 'https://github.com/org/private.git',
        githubToken: secretToken,
      });
    },
    (err: Error) => {
      // Must NOT contain the secret token
      assert.ok(!err.message.includes(secretToken));
      assert.ok(err.message.includes('***'));
      return true;
    }
  );

  // Sandbox must be terminated on failed initialize
  assert.equal(env.isClosed(), true);
  assert.equal(manager.getSandbox(), null);
});

test('SandboxManager - runBuildAndVerify executes install, test, and build strictly in targetDirectory', async () => {
  const env = createMockEnvironment();
  const manager = new SandboxManager(env.factory);

  await manager.initialize({
    repoUrl: 'https://github.com/acme/app.git',
    githubToken: 'token',
    targetDirectory: 'apps/web',
  });

  const result = await manager.runBuildAndVerify(5000);

  assert.equal(result.success, true);
  assert.ok(result.stdout.length > 0);

  // Verify all 3 commands were executed strictly inside /home/user/repo/apps/web
  const buildCommands = env.executedCommands.filter((c) =>
    c.cmd.startsWith('npm install') || c.cmd.startsWith('npm test') || c.cmd.startsWith('npm run build')
  );

  assert.equal(buildCommands.length, 3);
  for (const cmd of buildCommands) {
    assert.equal(cmd.cwd, '/home/user/repo/apps/web');
  }
});

test('SandboxManager - runBuildAndVerify returns success false when any build step fails', async () => {
  const env = createMockEnvironment({
    processHandler: (opts) => {
      if (opts.cmd.includes('npm test')) {
        return {
          exitCode: 1,
          stdout: '1 test failed',
          stderr: 'AssertionError: Expected true to be false',
        };
      }
      return { exitCode: 0, stdout: 'ok', stderr: '' };
    },
  });

  const manager = new SandboxManager(env.factory);
  await manager.initialize({
    repoUrl: 'https://github.com/acme/app.git',
    githubToken: 'token',
  });

  const result = await manager.runBuildAndVerify(5000);

  assert.equal(result.success, false);
  assert.ok(result.stderr.includes('AssertionError'));
});

test('SandboxManager - runBuildAndVerify enforces timeout', async () => {
  const env = createMockEnvironment({
    processHandler: async () => {
      // Simulate long-running build process
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { exitCode: 0, stdout: 'done', stderr: '' };
    },
  });

  const manager = new SandboxManager(env.factory);
  await manager.initialize({
    repoUrl: 'https://github.com/acme/app.git',
    githubToken: 'token',
  });

  // Enforce a tiny timeout of 50ms
  const result = await manager.runBuildAndVerify(50);

  assert.equal(result.success, false);
  assert.ok(result.stderr.includes('timed out'));
});

test('SandboxManager - readFile and writeFile resolve relative paths to scoped targetDirectory', async () => {
  const env = createMockEnvironment({
    files: {
      '/home/user/repo/apps/web/src/index.html': '<h1>Initial</h1>',
    },
  });

  const manager = new SandboxManager(env.factory);
  await manager.initialize({
    repoUrl: 'https://github.com/acme/app.git',
    githubToken: 'token',
    targetDirectory: 'apps/web',
  });

  // Reading relative path
  const content = await manager.readFile('src/index.html');
  assert.equal(content, '<h1>Initial</h1>');

  // Writing relative path
  await manager.writeFile('src/index.html', '<h1>Updated</h1>');
  assert.equal(env.storedFiles.get('/home/user/repo/apps/web/src/index.html'), '<h1>Updated</h1>');

  // Reading back updated content
  const updatedContent = await manager.readFile('src/index.html');
  assert.equal(updatedContent, '<h1>Updated</h1>');
});

test('SandboxManager - terminate closes the sandbox and is idempotent', async () => {
  const env = createMockEnvironment();
  const manager = new SandboxManager(env.factory);

  await manager.initialize({
    repoUrl: 'https://github.com/acme/app.git',
    githubToken: 'token',
  });

  assert.ok(manager.getSandbox() !== null);
  assert.equal(env.isClosed(), false);

  await manager.terminate();
  assert.equal(env.isClosed(), true);
  assert.equal(manager.getSandbox(), null);

  // Calling terminate again should be safe and idempotent
  await manager.terminate();
  assert.equal(manager.getSandbox(), null);
});

test('SandboxManager - isPathIgnored correctly checks configured ignorePatterns', async () => {
  const env = createMockEnvironment();
  const manager = new SandboxManager(env.factory);

  await manager.initialize({
    repoUrl: 'https://github.com/acme/app.git',
    githubToken: 'token',
    ignorePatterns: ['dist', '*.min.js', 'vendor/'],
  });

  assert.equal(manager.isPathIgnored('src/components/Button.tsx'), false);
  assert.equal(manager.isPathIgnored('dist/index.js'), true);
  assert.equal(manager.isPathIgnored('static/bundle.min.js'), true);
  assert.equal(manager.isPathIgnored('vendor/legacy.js'), true);
});
