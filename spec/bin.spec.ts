import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const localPath = join(tmpdir(), `symbol-upload-spec-${randomUUID()}`);
const detectForcedExit = ['-r', './spec/support/detect-forced-exit.js'];
const cliTimeout = 25_000;

function runCli(
  args: string[],
  nodeArgs: string[] = [],
  env: NodeJS.ProcessEnv = {}
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [...nodeArgs, '-r', 'ts-node/register', 'bin/index.ts', ...args],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } }
    );

    // Kill the child ourselves so a hang can't outlive the spec and orphan a process.
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`symbol-upload ${args.join(' ')} did not exit within ${cliTimeout}ms`));
    }, cliTimeout);

    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data) => (output += data));
    child.stderr.on('data', (data) => (output += data));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    // Resolve on close, not exit: exit fires while the stdio pipes can still have buffered output,
    // which truncates what the assertions below read.
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

describe('bin', () => {
  it('should exit non-zero when no symbol files match the glob', async () => {
    const { code, output } = await runCli([
      '-d', './spec/support',
      '-f', '**/*.no-such-extension',
      '-l', localPath,
    ]);

    expect(code).toBe(1);
    expect(output).toContain('Could not find any files to upload');
  }, 30_000);

  it('should exit zero when symbol files are processed', async () => {
    const { code } = await runCli([
      '-d', './spec/support',
      '-f', '*.sym',
      '-l', localPath,
    ]);

    expect(code).toBe(0);
  }, 30_000);

  it('should exit non-zero when a required argument is missing', async () => {
    const { code, output } = await runCli(['-f', '*.sym']);

    expect(code).toBe(1);
    expect(output).toContain('Missing argument');
  }, 30_000);

  // process.exit() tears the event loop down while libuv still has work in flight, which trips an
  // assertion in src/win/async.c on Windows and loses the exit code. Draining is what makes the
  // code reliable, so the absence of a forced exit is the behavior worth pinning.
  it('should drain instead of forcing an exit when no symbol files match', async () => {
    const { code, output } = await runCli(
      [
        '-d', './spec/support',
        '-f', '**/*.no-such-extension',
        '-l', localPath,
      ],
      detectForcedExit
    );

    expect(output).not.toContain('FORCED_EXIT');
    expect(code).toBe(1);
  }, 30_000);

  it('should drain instead of forcing an exit on success', async () => {
    const { code, output } = await runCli(
      ['-d', './spec/support', '-f', '*.sym', '-l', localPath],
      detectForcedExit
    );

    expect(output).not.toContain('FORCED_EXIT');
    expect(code).toBe(0);
  }, 30_000);

  it('should drain instead of forcing an exit when a required argument is missing', async () => {
    const { code, output } = await runCli(['-f', '*.sym'], detectForcedExit);

    expect(output).not.toContain('FORCED_EXIT');
    expect(code).toBe(1);
  }, 30_000);

  // A build reported authentication failing while the exe still returned 0, so the step passed.
  describe('authentication failure', () => {
    let server: Server;
    let host: string;

    const authArgs = ['-b', 'db', '-a', 'app', '-v', '1.0', '-i', 'id', '-s', 'secret'];

    beforeAll(async () => {
      server = createServer((_, response) => {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ message: 'Unknown clientId 🎫' }));
      });
      await new Promise<void>((resolve) => server.listen(0, resolve));
      host = `http://localhost:${(server.address() as AddressInfo).port}`;
    });

    it('should exit non-zero when authentication fails', async () => {
      const { code, output } = await runCli(
        ['-d', './spec/support', '-f', '*.sym', ...authArgs],
        [],
        { BUGSPLAT_HOST: host }
      );

      expect(output).toContain('Unknown clientId');
      expect(output).not.toContain('Authentication success!');
      expect(code).toBe(1);
    }, 30_000);

    it('should drain instead of forcing an exit when authentication fails', async () => {
      const { code, output } = await runCli(
        ['-d', './spec/support', '-f', '*.sym', ...authArgs],
        detectForcedExit,
        { BUGSPLAT_HOST: host }
      );

      expect(output).not.toContain('FORCED_EXIT');
      expect(code).toBe(1);
    }, 30_000);

    // The CLI's fetch leaves a keep-alive socket open, and close() waits on it forever.
    afterAll(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
  });

  afterAll(async () => await rm(localPath, { recursive: true, force: true }));
});
