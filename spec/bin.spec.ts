import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const localPath = join(tmpdir(), `symbol-upload-spec-${randomUUID()}`);

function runCli(args: string[]): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['-r', 'ts-node/register', 'bin/index.ts', ...args],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let output = '';
    child.stdout.on('data', (data) => (output += data));
    child.stderr.on('data', (data) => (output += data));
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, output }));
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

  afterAll(async () => await rm(localPath, { recursive: true, force: true }));
});
