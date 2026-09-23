import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { STLLoader } from './server-loaders/STLLoader.js';
import { PLYLoader } from './server-loaders/PLYLoader.js';
import { parseMeshText, validateParsedGeometry } from './src/mesh-formats.js';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(appDir, '..');
const resourceRoot = process.env.OPENCUSP_RESOURCE_ROOT || projectDir;
const dataRoot = process.env.OPENCUSP_DATA_ROOT || path.join(projectDir, 'data');
const privateSampleDir = path.join(resourceRoot, 'data', 'BlueSky_Crown_Practice');
const publicSampleDir = path.join(resourceRoot, 'data', 'demo');
const sampleDir = process.env.OPENCUSP_SAMPLE_DIR || await fs.access(privateSampleDir).then(() => privateSampleDir).catch(() => publicSampleDir);
const usesLegacySample = path.basename(sampleDir).toLowerCase() === 'bluesky_crown_practice';
const userDir = process.env.OPENCUSP_USER_DIR || path.join(dataRoot, 'user_meshes');
const stateDir = process.env.OPENCUSP_STATE_DIR || path.join(dataRoot, 'cases');
const distDir = process.env.OPENCUSP_DIST_DIR || path.join(appDir, 'dist');
const port = Number(process.env.PORT || 4179);
const app = express();
const maxTriangles = 1_000_000;
const defaultOrigins = [
  'http://127.0.0.1:' + port,
  'http://localhost:' + port,
  'http://127.0.0.1:5173',
  'http://localhost:5173'
];
const allowedOrigins = new Set((process.env.OPENCUSP_ALLOWED_ORIGINS || defaultOrigins.join(',')).split(',').map((value) => value.trim()).filter(Boolean));

await fs.mkdir(userDir, { recursive: true });
await fs.mkdir(stateDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, userDir),
  filename: (req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const role = String(req.body.role || 'scan').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'scan';
    callback(null, role + '-' + randomUUID() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 64 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.stl', '.ply', '.obj', '.off', '.xyz', '.pts', '.csv', '.pcd'].includes(ext)) return callback(new Error('Supported inputs are STL, PLY, OBJ, OFF, XYZ, PTS, CSV, and ASCII PCD.'));
    callback(null, true);
  }
});

function localOrigin(origin) {
  return typeof origin === 'string' && allowedOrigins.has(origin);
}
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !localOrigin(req.get('origin'))) {
    return res.status(403).json({ error: 'Mutation requests must come from the local application.' });
  }
  next();
});

async function validateUploadedMesh(file) {
  const bytes = await fs.readFile(file.path);
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.stl') {
    if (bytes.length >= 84) {
      const triangles = bytes.readUInt32LE(80);
      if (triangles > 0 && bytes.length === 84 + triangles * 50) {
        if (triangles > maxTriangles) throw new Error('Mesh exceeds the local preview limit of ' + maxTriangles.toLocaleString() + ' triangles.');
        return { ...validateGeometry(new STLLoader().parse(toArrayBuffer(bytes))), geometryType: 'surface-mesh' };
      }
    }
    const text = bytes.subarray(0, Math.min(bytes.length, 2048)).toString('ascii').trimStart();
    if (/^solid\b/i.test(text) && /endsolid\b/i.test(bytes.subarray(Math.max(0, bytes.length - 2048)).toString('ascii'))) {
      return { ...validateGeometry(new STLLoader().parse(toArrayBuffer(bytes))), geometryType: 'surface-mesh' };
    }
    throw new Error('The STL file does not have a valid binary length or ASCII solid header.');
  }
  if (ext === '.ply') {
    const headerEnd = bytes.indexOf(Buffer.from('end_header'));
    if (headerEnd < 0 || headerEnd > 65536) throw new Error('The PLY file is missing a readable end_header marker.');
    const header = bytes.subarray(0, headerEnd + 10).toString('ascii');
    const vertexCount = Number(header.match(/^element vertex ([1-9]\d*)$/m)?.[1]);
    const faceCount = Number(header.match(/^element face ([0-9]+)$/m)?.[1] || 0);
    if (!/^ply\s/.test(header) || !/^format (ascii|binary_little_endian|binary_big_endian) 1\.0$/m.test(header) || !vertexCount) {
      throw new Error('The PLY header is missing a supported format or vertex declaration.');
    }
    if (vertexCount > maxTriangles * 3 || faceCount > maxTriangles) throw new Error('Mesh exceeds the local preview limit of ' + maxTriangles.toLocaleString() + ' triangles.');
    return { ...validateGeometry(new PLYLoader().parse(toArrayBuffer(bytes))), geometryType: 'surface-mesh' };
  }
  if (['.obj', '.off', '.xyz', '.pts', '.csv', '.pcd'].includes(ext)) {
    const parsed = parseMeshText(bytes.toString('utf8'), ext);
    return validateParsedGeometry(parsed);
  }
  throw new Error('Unsupported mesh type.');
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function validateGeometry(geometry) {
  try {
    const position = geometry.attributes.position;
    const triangleCount = geometry.index ? geometry.index.count / 3 : position?.count / 3;
    if (!position || !Number.isInteger(triangleCount) || triangleCount < 1) throw new Error('Mesh contains no complete triangles.');
    if (triangleCount > maxTriangles) throw new Error('Mesh exceeds the local preview limit of ' + maxTriangles.toLocaleString() + ' triangles.');
    const coords = position.array;
    for (let i = 0; i < coords.length; i++) {
      if (!Number.isFinite(coords[i])) throw new Error('Mesh contains a non-finite vertex coordinate.');
    }
    return { triangles: triangleCount, vertices: position.count };
  } finally {
    geometry.dispose();
  }
}

app.use('/sample', express.static(sampleDir, { fallthrough: false, maxAge: 0 }));
app.use('/user-meshes', express.static(userDir, { fallthrough: false, maxAge: 0 }));
app.use(express.json({ limit: '2mb' }));
app.get('/api/health', (_req, res) => res.json({
  ok: true,
  app: 'OpenCusp CAD',
  localOnly: true,
  acceptedInputFormats: ['stl', 'ply', 'obj', 'off', 'xyz', 'pts', 'csv', 'pcd-ascii'],
  camHandoffFormats: ['stl', 'obj'],
  directMachineTransmission: false
}));
app.get('/api/cases', async (_req, res) => {
  const names = await fs.readdir(stateDir);
  const cases = [];
  for (const name of names) {
    if (!/^[a-z0-9_-]{1,64}\.json$/i.test(name)) continue;
    try {
      const value = JSON.parse(await fs.readFile(path.join(stateDir, name), 'utf8'));
      const id = name.slice(0, -5);
      if (value.schemaVersion === 1 && value.caseId === id && Array.isArray(value.sources)) {
        cases.push({ id, title: value.caseTitle || 'Saved scan case', savedAt: value.savedAt || null, sourceCount: value.sources.length });
      }
    } catch { /* Ignore incomplete or unsupported local manifests. */ }
  }
  cases.sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
  res.json({ cases });
});
const legacyDemoFiles = [
  { name: 'Pre-op maxilla', role: 'preop', url: '/sample/preop_arch.stl', sha256: '49e3bedabe815832a5f3f94379b9793c359e6166bf82195d879c49cfa5ed2daf', unit: 'mm', unitProvenance: 'BlueSky-linked case geometry report; source coordinates preserved', visible: false, color: '#a8b3bb', opacity: 0.28 },
  { name: 'Prepared maxilla', role: 'upper', url: '/sample/prep_arch.stl', sha256: '7c661ecc0e72c77db54a6df13f4381d546ab038089e9b9d8a2517cd567e7ce2d', unit: 'mm', unitProvenance: 'BlueSky-linked case geometry report; source coordinates preserved', visible: true, color: '#d7dce0', opacity: 0.62 },
  { name: 'Opposing mandible', role: 'opposing', url: '/sample/opposing_mandible.stl', sha256: '652b691bf2dba1af6202ef4c56d8703269d5602dfb1913cc64ae00c08a8cc89e', unit: 'mm', unitProvenance: 'BlueSky-linked case geometry report; source coordinates preserved', visible: true, color: '#8ba6b3', opacity: 0.36 },
  { name: 'Prepared die #3', role: 'prep', url: '/sample/prepared_die.stl', sha256: 'd7271ba75e923e4920721d87813f649be5bfaf8627d7a91724640f89c272179f', unit: 'mm', unitProvenance: 'BlueSky-linked case geometry report; source coordinates preserved', visible: true, color: '#e4a55c', opacity: 1 },
  { name: 'Vendor reference crown', role: 'reference', url: '/sample/reference_crown.stl', sha256: '2438df4b4c435a045af1fd176ea2d222e8ec2a7d7e244d87b3531432e4024288', unit: 'mm', unitProvenance: 'BlueSky-linked case geometry report; source coordinates preserved', visible: false, color: '#c78dba', opacity: 0.72 }
];

async function publicDemoFiles() {
  const filename = 'demo_box.stl';
  const bytes = await fs.readFile(path.join(sampleDir, filename));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const base = { url: '/sample/' + filename, sha256, unit: 'mm', unitToMm: 1, unitProvenance: 'Original synthetic OpenCusp fixture; generic dimensions only', color: '#93a6a4', opacity: 0.72, transform: { rotation: [0, 0, 0, 'XYZ'], scale: [1, 1, 1] } };
  return [
    { ...base, name: 'Synthetic arch block', role: 'upper', visible: true, color: '#d7dce0', opacity: 0.62, transform: { ...base.transform, position: [0, 0, -3] } },
    { ...base, name: 'Synthetic antagonist block', role: 'opposing', visible: true, color: '#8ba6b3', opacity: 0.36, transform: { ...base.transform, position: [0, 0, 15] } },
    { ...base, name: 'Synthetic preparation block', role: 'prep', visible: true, color: '#e4a55c', opacity: 1, transform: { ...base.transform, position: [0, 0, 0] } },
    { ...base, name: 'Synthetic pre-op block', role: 'preop', visible: false, color: '#a8b3bb', opacity: 0.28, transform: { ...base.transform, position: [0, 0, -8] } }
  ];
}

app.get('/api/demo', async (_req, res) => {
  try {
    const legacy = usesLegacySample;
    res.json({
      id: legacy ? 'bluesky-practice-3' : 'opencusp-public-demo',
      title: legacy ? 'Crown practice case · #3' : 'OpenCusp public demo · synthetic mesh',
      source: legacy ? 'BlueSkyPlan-linked Crown Design, Print, Polish practice files' : 'Original synthetic fixture; no patient data or dental scan rights involved',
      unit: 'mm',
      files: legacy ? legacyDemoFiles : await publicDemoFiles()
    });
  } catch (error) {
    res.status(503).json({ error: 'The configured demo fixture is unavailable: ' + error.message });
  }
});
function safeCaseId(raw) {
  const id = String(raw || '');
  const safe = id.replace(/[^a-z0-9_-]/gi, '').slice(0, 64);
  return safe && safe === id ? safe : null;
}
async function readSavedCase(safeId) {
  return JSON.parse(await fs.readFile(path.join(stateDir, safeId + '.json'), 'utf8'));
}
async function writeStateFile(file, value) {
  const temp = file + '.' + process.pid + '.tmp';
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temp, file);
}
app.post('/api/upload', upload.single('mesh'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No mesh file received.' });
  validateUploadedMesh(req.file).then((meshInfo) => fs.readFile(req.file.path).then((bytes) => ({ meshInfo, bytes }))).then(({ meshInfo, bytes }) => {
    res.json({
      name: req.file.originalname,
      role: req.body.role || 'scan',
      url: '/user-meshes/' + encodeURIComponent(req.file.filename),
      bytes: req.file.size,
      triangles: meshInfo.triangles,
      vertices: meshInfo.vertices,
      geometryType: meshInfo.geometryType,
      sha256: createHash('sha256').update(bytes).digest('hex')
    });
  }).catch(async (error) => {
    await fs.rm(req.file.path, { force: true });
    res.status(400).json({ error: error.message || 'Mesh validation failed.' });
  });
});
app.get('/api/design/:id', async (req, res) => {
  const safeId = String(req.params.id).replace(/[^a-z0-9_-]/gi, '').slice(0, 64);
  if (!safeId || safeId !== req.params.id) return res.status(400).json({ error: 'Invalid case id.' });
  try {
    const payload = await fs.readFile(path.join(stateDir, safeId + '.json'), 'utf8');
    res.type('json').send(payload);
  } catch {
    res.status(404).json({ error: 'No saved design for this case.' });
  }
});
app.get('/api/design/:id/approval', async (req, res) => {
  const safeId = safeCaseId(req.params.id);
  if (!safeId) return res.status(400).json({ error: 'Invalid case id.' });
  try {
    res.type('json').send(await fs.readFile(path.join(stateDir, safeId + '-approval.json'), 'utf8'));
  } catch {
    res.status(404).json({ error: 'No approval record exists for this design.' });
  }
});
app.post('/api/design/:id/approval', async (req, res) => {
  const safeId = safeCaseId(req.params.id);
  if (!safeId) return res.status(400).json({ error: 'Invalid case id.' });
  const body = req.body || {};
  if (body.approved !== true || !String(body.reviewerName || '').trim() || !String(body.approvalId || '').trim() || !/^[a-f0-9]{64}$/i.test(body.designFingerprint || '')) {
    return res.status(400).json({ error: 'Approval requires approved=true, reviewer name, approval ID, and a design fingerprint.' });
  }
  let saved;
  try { saved = await readSavedCase(safeId); } catch { return res.status(404).json({ error: 'Save the design before requesting approval.' }); }
  if (saved.designStale === true || saved.generatedMesh?.sha256 !== body.designFingerprint) return res.status(409).json({ error: 'Approval fingerprint does not match a fresh saved proposal.' });
  const approval = {
    schemaVersion: 1,
    approved: true,
    caseId: safeId,
    reviewerName: String(body.reviewerName).trim().slice(0, 160),
    reviewerRole: String(body.reviewerRole || 'qualified dental reviewer').trim().slice(0, 160),
    approvalId: String(body.approvalId).trim().slice(0, 160),
    note: String(body.note || '').trim().slice(0, 2000),
    designFingerprint: body.designFingerprint.toLowerCase(),
    reviewedAt: String(body.reviewedAt || new Date().toISOString())
  };
  await writeStateFile(path.join(stateDir, safeId + '-approval.json'), approval);
  res.json({ ok: true, approval });
});
app.post('/api/design/:id/cam-handoff', async (req, res) => {
  const safeId = safeCaseId(req.params.id);
  if (!safeId) return res.status(400).json({ error: 'Invalid case id.' });
  const body = req.body || {};
  const format = String(body.format || '').toLowerCase();
  if (!['stl', 'obj'].includes(format)) return res.status(400).json({ error: 'CAM handoff format must be STL or OBJ.' });
  if (!/^[a-f0-9]{64}$/i.test(body.designFingerprint || '') || !String(body.machineProfile || '').trim() || !String(body.camVersion || '').trim() || !String(body.material || '').trim() || !String(body.blank || '').trim() || !String(body.toolProfile || '').trim()) {
    return res.status(400).json({ error: 'CAM handoff requires a matching fingerprint and named machine, CAM version, material, blank, and tool profile.' });
  }
  let saved, approval;
  try {
    saved = await readSavedCase(safeId);
    approval = JSON.parse(await fs.readFile(path.join(stateDir, safeId + '-approval.json'), 'utf8'));
  } catch {
    return res.status(403).json({ error: 'A saved professional approval is required before CAM handoff.' });
  }
  if (saved.designStale === true || saved.generatedMesh?.sha256 !== body.designFingerprint || approval.approved !== true || approval.designFingerprint !== body.designFingerprint) {
    return res.status(409).json({ error: 'CAM handoff is blocked because approval and the saved proposal do not match.' });
  }
  const stamp = new Date().toISOString();
  const manifest = {
    schemaVersion: 1,
    product: 'OpenCusp Dental CAD',
    caseId: safeId,
    createdAt: stamp,
    delivery: 'local-file-handoff-only',
    directMachineTransmission: false,
    geometry: {
      format,
      units: 'mm',
      fileName: safeId + '-CAM-REVIEW-REQUIRED.' + format,
      sha256: body.designFingerprint,
      status: 'CAM_SIMULATION_AND_OPERATOR_CHECK_REQUIRED'
    },
    machine: {
      profile: String(body.machineProfile).trim().slice(0, 200),
      camVersion: String(body.camVersion).trim().slice(0, 120),
      material: String(body.material).trim().slice(0, 120),
      blank: String(body.blank).trim().slice(0, 200),
      toolProfile: String(body.toolProfile).trim().slice(0, 200)
    },
    sourceFormats: Array.isArray(body.sourceFormats) ? body.sourceFormats.map((value) => String(value).slice(0, 12)).slice(0, 32) : [],
    restorationType: String(body.restorationType || 'single-crown').slice(0, 80),
    approval: { reviewerName: approval.reviewerName, reviewerRole: approval.reviewerRole, approvalId: approval.approvalId, reviewedAt: approval.reviewedAt, designFingerprint: approval.designFingerprint },
    warning: 'This package is not a validated toolpath. The authorized operator must import it into the named CAM system, confirm units and orientation, run the exact machine/material simulation, and approve fabrication.'
  };
  manifest.manifestFileName = safeId + '-CAM-handoff.json';
  await writeStateFile(path.join(stateDir, safeId + '-cam-handoff.json'), manifest);
  res.json({ ok: true, manifest });
});
app.post('/api/design/:id', async (req, res) => {
  const safeId = String(req.params.id).replace(/[^a-z0-9_-]/gi, '').slice(0, 64);
  if (!safeId || safeId !== req.params.id) return res.status(400).json({ error: 'Invalid case id.' });
  const file = path.join(stateDir, safeId + '.json');
  const body = { ...req.body, savedAt: new Date().toISOString(), caseId: safeId };
  const temp = file + '.' + process.pid + '.tmp';
  await fs.writeFile(temp, JSON.stringify(body, null, 2), 'utf8');
  await fs.rename(temp, file);
  res.json({ ok: true, savedAt: body.savedAt });
});
app.get('/api/design/:id/mesh', async (req, res) => {
  const safeId = String(req.params.id).replace(/[^a-z0-9_-]/gi, '').slice(0, 64);
  if (!safeId || safeId !== req.params.id) return res.status(400).json({ error: 'Invalid case id.' });
  try {
    const requestedHash = String(req.query.sha256 || '');
    if (requestedHash && !/^[a-f0-9]{64}$/.test(requestedHash)) return res.status(400).json({ error: 'Invalid proposal checksum.' });
    const file = requestedHash
      ? path.join(stateDir, safeId + '-proposal-' + requestedHash + '.stl')
      : path.join(stateDir, safeId + '-proposal.stl');
    res.type('application/octet-stream').send(await fs.readFile(file));
  } catch {
    res.status(404).json({ error: 'No saved proposal mesh for this case.' });
  }
});
app.put('/api/design/:id/mesh', express.raw({ type: 'application/octet-stream', limit: '100mb' }), async (req, res) => {
  const safeId = String(req.params.id).replace(/[^a-z0-9_-]/gi, '').slice(0, 64);
  if (!safeId || safeId !== req.params.id) return res.status(400).json({ error: 'Invalid case id.' });
  if (!Buffer.isBuffer(req.body) || req.body.length < 134) return res.status(400).json({ error: 'Expected a non-empty binary STL mesh.' });
  const triangles = req.body.readUInt32LE(80);
  if (!triangles || req.body.length !== 84 + triangles * 50) return res.status(400).json({ error: 'Binary STL length does not match its triangle count.' });
  const sha256 = createHash('sha256').update(req.body).digest('hex');
  const file = path.join(stateDir, safeId + '-proposal-' + sha256 + '.stl');
  const temp = file + '.' + process.pid + '.tmp';
  if (!(await fs.access(file).then(() => true).catch(() => false))) {
    await fs.writeFile(temp, req.body);
    await fs.rename(temp, file);
  }
  res.json({ ok: true, url: '/api/design/' + safeId + '/mesh?sha256=' + sha256, bytes: req.body.length, triangles, sha256 });
});

const hasBuild = await fs.access(distDir).then(() => true).catch(() => false);
if (hasBuild) {
  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
} else {
  app.get('/', (_req, res) => res.status(200).send('OpenCusp API is running. Start the Vite development app with npm run dev.'));
}

app.use((error, _req, res, _next) => {
  console.error(error.message);
  res.status(400).json({ error: error.message || 'Request failed.' });
});

app.listen(port, '127.0.0.1', () => {
  console.log('OpenCusp local service listening on http://127.0.0.1:' + port);
});
