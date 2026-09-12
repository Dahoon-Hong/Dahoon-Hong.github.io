import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_READY_TIMEOUT_MS = 15_000;
export const DEFAULT_MANIFEST_DIRECTORY = 'codex-integration-runtime';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export function parseArgs(args) {
  const [command, ...tokens] = args;
  if (!command) throw new Error('usage: integration-runtime.mjs <start|stop> [options]');

  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);

    const separator = token.indexOf('=');
    const key = separator >= 0 ? token.slice(2, separator) : token.slice(2);
    const inlineValue = separator >= 0 ? token.slice(separator + 1) : undefined;
    if (!key) throw new Error('option name cannot be empty');
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const value = tokens[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    options[key] = value;
    index += 1;
  }

  return { command, options };
}

export function validatePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`port must be an integer from 1 to 65535: ${value}`);
  }
  return port;
}

function validateHost(value) {
  if (!/^[a-zA-Z0-9.:[\]-]+$/.test(value)) throw new Error(`host contains unsupported characters: ${value}`);
  return value;
}

function validateTimeout(value, name) {
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout <= 0) throw new Error(`${name} must be a positive integer: ${value}`);
  return timeout;
}

function defaultManifestPath(worktree) {
  const worktreeId = createHash('sha1').update(worktree.toLowerCase()).digest('hex').slice(0, 12);
  return resolve(tmpdir(), DEFAULT_MANIFEST_DIRECTORY, `${worktreeId}.json`);
}

function resolveManifestPath(worktree, requestedPath) {
  return requestedPath ? resolve(worktree, requestedPath) : defaultManifestPath(worktree);
}

async function assertPortAvailable(host, port) {
  await new Promise((resolvePromise, reject) => {
    const probe = createServer();
    const onError = () => {
      probe.close();
      reject(new Error(`port ${port} is already in use on ${host}`));
    };
    probe.once('error', onError);
    probe.listen(port, host, () => {
      probe.close((error) => {
        if (error) reject(error);
        else resolvePromise();
      });
    });
  });
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function acquireLock(lockPath, worktree) {
  await mkdir(dirname(lockPath), { recursive: true });
  const lock = JSON.stringify({ launcherPid: process.pid, worktree });
  try {
    await writeFile(lockPath, lock, { encoding: 'utf8', flag: 'wx' });
    return;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }

  let existing = null;
  try {
    existing = JSON.parse(await readFile(lockPath, 'utf8'));
  } catch {
    // An incomplete lock can only be removed when no owner process is alive.
  }
  if (isProcessAlive(Number(existing?.launcherPid))) {
    throw new Error(`runtime lock is active: ${lockPath}`);
  }

  await rm(lockPath, { force: true });
  await writeFile(lockPath, lock, { encoding: 'utf8', flag: 'wx' });
}

async function waitForReady(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let exited = false;
  let exitCode = null;
  const onExit = (code) => {
    exited = true;
    exitCode = code;
  };
  const onError = () => {
    exited = true;
  };
  child.once('exit', onExit);
  child.once('error', onError);

  try {
    while (Date.now() < deadline) {
      if (exited) throw new Error(`dev server exited before readiness (code=${exitCode ?? 'unknown'})`);
      const controller = new AbortController();
      const requestTimeout = setTimeout(() => controller.abort(), 1_000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (response.ok) return;
      } catch {
        // Vite is still starting or the port is occupied by a non-HTTP service.
      } finally {
        clearTimeout(requestTimeout);
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
    throw new Error(`dev server did not become ready within ${timeoutMs}ms: ${url}`);
  } finally {
    child.off('exit', onExit);
    child.off('error', onError);
  }
}

async function waitForExit(pid, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (isProcessAlive(pid) && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  return !isProcessAlive(pid);
}

async function stopProcessTree(pid, child) {
  if (!isProcessAlive(pid)) return;
  if (child && !child.killed) {
    child.kill();
    if (await waitForExit(pid)) return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    if (await waitForExit(pid)) return;
  } catch {
    // Fall back to a process-tree termination below.
  }
  if (process.platform !== 'win32') {
    throw new Error(`process is still alive after SIGTERM: ${pid}`);
  }

  await new Promise((resolvePromise, reject) => {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.once('close', (code) => {
      if (code === 0 || !isProcessAlive(pid)) resolvePromise();
      else reject(new Error(`taskkill failed for pid ${pid} (exit=${code})`));
    });
    killer.once('error', reject);
  });
  if (isProcessAlive(pid)) throw new Error(`process is still alive after taskkill: ${pid}`);
}

function startDevServer(worktree, host, port) {
  const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : npmCommand;
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `${npmCommand} run dev -- --host ${host} --port ${port} --strictPort`]
    : ['run', 'dev', '--', '--host', host, '--port', String(port), '--strictPort'];
  const child = spawn(
    command,
    args,
    {
      cwd: worktree,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  child.stdout?.on('data', (chunk) => process.stdout.write(`[runtime] ${chunk}`));
  child.stderr?.on('data', (chunk) => process.stderr.write(`[runtime] ${chunk}`));
  return child;
}

async function startRuntime(options) {
  const worktree = resolve(options.worktree ?? process.cwd());
  const host = validateHost(options.host ?? DEFAULT_HOST);
  const port = validatePort(options.port);
  const readyTimeoutMs = validateTimeout(
    options['ready-timeout-ms'] ?? DEFAULT_READY_TIMEOUT_MS,
    'ready-timeout-ms',
  );
  const manifestPath = resolveManifestPath(worktree, options.manifest);
  const lockPath = `${manifestPath}.lock`;
  const runtimeId = String(options['runtime-id'] ?? `plan-test-${Date.now()}-${process.pid}`);
  if (!runtimeId.trim()) throw new Error('runtime-id cannot be empty');

  await access(join(worktree, 'package.json'));
  await acquireLock(lockPath, worktree);

  const url = `http://${host}:${port}/`;
  let server;
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    let stopError;
    try {
      await stopProcessTree(server?.pid, server);
    } catch (error) {
      stopError = error;
    }
    if (!stopError || !isProcessAlive(server?.pid)) {
      await rm(manifestPath, { force: true });
      await rm(lockPath, { force: true });
    }
    if (stopError) throw stopError;
  };

  let resolveSignal;
  const signalPromise = new Promise((resolvePromise) => {
    resolveSignal = resolvePromise;
  });
  const signalHandler = () => resolveSignal();
  process.once('SIGINT', signalHandler);
  process.once('SIGTERM', signalHandler);

  try {
    await assertPortAvailable(host, port);
    server = startDevServer(worktree, host, port);
    await Promise.race([
      waitForReady(url, server, readyTimeoutMs),
      signalPromise.then(() => { throw new Error('runtime start interrupted'); }),
    ]);

    const manifest = {
      runtimeId,
      worktree,
      host,
      port,
      url,
      launcherPid: process.pid,
      serverPid: server.pid,
      startedAt: new Date().toISOString(),
      status: 'ready',
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`INTEGRATION_RUNTIME_READY ${JSON.stringify(manifest)}`);

    await Promise.race([
      new Promise((resolvePromise, reject) => {
        server.once('exit', (code, signal) => {
          reject(new Error(`dev server exited (code=${code ?? 'unknown'}, signal=${signal ?? 'none'})`));
        });
        server.once('error', reject);
      }),
      signalPromise,
    ]);
  } finally {
    process.removeListener('SIGINT', signalHandler);
    process.removeListener('SIGTERM', signalHandler);
    await cleanup();
  }
}

async function stopRuntime(options) {
  const worktree = resolve(options.worktree ?? process.cwd());
  const manifestPath = resolveManifestPath(worktree, options.manifest);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.log(`runtime manifest not found: ${manifestPath}`);
      return;
    }
    throw error;
  }

  if (resolve(manifest.worktree) !== worktree) throw new Error('runtime worktree does not match --worktree');
  if (options['runtime-id'] && options['runtime-id'] !== manifest.runtimeId) {
    throw new Error(`runtime-id does not match manifest: ${options['runtime-id']}`);
  }

  await stopProcessTree(Number(manifest.serverPid));
  await stopProcessTree(Number(manifest.launcherPid));
  await rm(manifestPath, { force: true });
  await rm(`${manifestPath}.lock`, { force: true });
  console.log(`INTEGRATION_RUNTIME_STOPPED ${manifest.runtimeId}`);
}

export async function main(args = process.argv.slice(2)) {
  const { command, options } = parseArgs(args);
  if (command === 'start') return startRuntime(options);
  if (command === 'stop') return stopRuntime(options);
  throw new Error(`unknown command: ${command}`);
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  main().catch((error) => {
    console.error(`[runtime] ${error.message}`);
    process.exitCode = 1;
  });
}
