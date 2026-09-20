import { app, BrowserWindow, dialog } from 'electron';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let serverProcess = null;
let serverPort = null;
let quitting = false;
function startupLog(message) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'startup.log'), `${new Date().toISOString()} ${message}\n`);
  } catch { /* Startup diagnostics must never prevent the app from opening. */ }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch { /* The child process may still be starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('OpenCusp local service did not become healthy.');
}

function startLocalService(port) {
  const serverScript = path.join(here, 'server.mjs');
  const resourceRoot = here;
  const packagedSample = path.join(process.resourcesPath, 'data', 'demo');
  const localPrivateSample = path.join(here, '..', 'data', 'BlueSky_Crown_Practice');
  const localPublicSample = path.join(here, '..', 'data', 'demo');
  const sampleDir = app.isPackaged ? packagedSample : (fs.existsSync(localPrivateSample) ? localPrivateSample : localPublicSample);
  const dataRoot = path.join(app.getPath('userData'), 'data');
  serverProcess = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      OPENCUSP_RESOURCE_ROOT: resourceRoot,
      OPENCUSP_DIST_DIR: path.join(here, 'dist'),
      OPENCUSP_SAMPLE_DIR: sampleDir,
      OPENCUSP_DATA_ROOT: dataRoot
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  startupLog(`spawned service pid=${serverProcess.pid} script=${serverScript} packaged=${app.isPackaged}`);
  serverProcess.once('error', (error) => startupLog(`service error ${error.stack || error.message || String(error)}`));
  serverProcess.stdout?.on('data', (chunk) => console.log(String(chunk).trimEnd()));
  serverProcess.stderr?.on('data', (chunk) => console.error(String(chunk).trimEnd()));
  serverProcess.once('exit', (code, signal) => {
    startupLog(`service exit code=${code} signal=${signal}`);
    if (code && !quitting) console.error(`OpenCusp service exited (${code ?? signal}).`);
  });
}

async function createWindow() {
  serverPort = await freePort();
  startupLog(`selected port=${serverPort}`);
  startLocalService(serverPort);
  await waitForHealth(serverPort);
  startupLog(`health ok port=${serverPort}`);
  const window = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f3f5f6',
    title: 'OpenCusp Dental CAD',
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  await window.loadURL(`http://127.0.0.1:${serverPort}`);
  startupLog('window loaded');
  window.on('closed', () => {
    if (serverProcess && !serverProcess.killed) serverProcess.kill();
    serverProcess = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { /* The first window remains the active case workspace. */ });
  app.whenReady().then(() => createWindow()).catch((error) => {
    startupLog(`startup failure ${error.stack || error.message || String(error)}`);
    console.error(error);
    dialog.showErrorBox('OpenCusp CAD could not start', error.message || String(error));
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    quitting = true;
    if (serverProcess && !serverProcess.killed) serverProcess.kill();
  });
}
