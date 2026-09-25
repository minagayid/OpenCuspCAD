import { app, BrowserWindow, dialog } from 'electron';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
if (process.env.PROCAD_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.PROCAD_USER_DATA));
}
let localServer = null;
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
  throw new Error('procad local service did not become healthy.');
}

async function startLocalService(port) {
  const resourceRoot = here;
  const packagedSample = path.join(process.resourcesPath, 'data', 'demo');
  const localPrivateSample = path.join(here, '..', 'data', 'BlueSky_Crown_Practice');
  const localPublicSample = path.join(here, '..', 'data', 'demo');
  const sampleDir = app.isPackaged ? packagedSample : (fs.existsSync(localPrivateSample) ? localPrivateSample : localPublicSample);
  const dataRoot = path.join(app.getPath('userData'), 'data');
  Object.assign(process.env, {
    PORT: String(port),
    PROCAD_RESOURCE_ROOT: resourceRoot,
    PROCAD_DIST_DIR: path.join(here, 'dist'),
    PROCAD_SAMPLE_DIR: sampleDir,
    PROCAD_DATA_ROOT: dataRoot
  });
  startupLog(`starting local service in main process packaged=${app.isPackaged}`);
  const service = await import('./server.mjs');
  localServer = service.server;
  startupLog(`service listening port=${port}`);
}

async function createWindow() {
  serverPort = await freePort();
  startupLog(`selected port=${serverPort}`);
  await startLocalService(serverPort);
  await waitForHealth(serverPort);
  startupLog(`health ok port=${serverPort}`);
  const window = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f3f5f6',
    title: 'procad Dental CAD',
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  await window.loadURL(`http://127.0.0.1:${serverPort}`);
  startupLog('window loaded');
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { /* The first window remains the active case workspace. */ });
  app.whenReady().then(() => createWindow()).catch((error) => {
    startupLog(`startup failure ${error.stack || error.message || String(error)}`);
    console.error(error);
    dialog.showErrorBox('procad CAD could not start', error.message || String(error));
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    quitting = true;
    if (localServer?.listening) localServer.close();
  });
}
