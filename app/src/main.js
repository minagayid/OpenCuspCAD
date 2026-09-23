import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { inspectClosedMesh } from './mesh-validation.js';
import ManifoldModule from 'manifold-3d/manifold';
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url';
import { MeshBVH } from 'three-mesh-bvh';
import { ACCEPTED_EXTENSIONS, POINT_CLOUD_EXTENSIONS, parseMeshText } from './mesh-formats.js';
import './styles.css';
import './case-ui.css';
import './import-ui.css';

const $ = (id) => document.getElementById(id);
const BUILT_IN_DEMO_IDS = new Set(['bluesky-practice-3', 'opencusp-public-demo']);
function isBuiltInDemoId(id = caseData?.id) { return BUILT_IN_DEMO_IDS.has(id); }
function isLegacyTrainingCase(id = caseData?.id) { return id === 'bluesky-practice-3'; }
const viewport = $('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf1f4f5);
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 2000);
camera.up.set(0, 0, 1);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true;
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
viewport.prepend(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.minDistance = 8;
controls.maxDistance = 600;
controls.target.set(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9598, 2.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(25, -15, 38);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xd3e2e3, 1.25);
fillLight.position.set(-25, 15, -20);
scene.add(fillLight);

const roleColors = { preop: '#a8b3bb', upper: '#d7dce0', opposing: '#8ba6b3', prep: '#e4a55c', reference: '#c78dba', crown: '#e5dccb', scan: '#93a6a4' };
const meshes = [];
let designMesh = null;
let caseData = null;
let designSnapshot = null;
let lastDesignClosed = false;
let isIsolated = false;
let isBusy = false;
let isImporting = false;
let isSwitchingCase = false;
let generationToken = 0;
let toastTimer = null;
let referenceTarget = null;
let approvalRecord = null;
let savedDesignHash = null;
const raycaster = new THREE.Raycaster();
let manifoldWasm = null;
let lastOcclusionGap = null;
let alignmentTimer = null;
const pointer = new THREE.Vector2();
const stlLoader = new STLLoader();
const plyLoader = new PLYLoader();
const materialFor = (color, opacity) => new THREE.MeshStandardMaterial({
  color: new THREE.Color(color), roughness: 0.61, metalness: 0.02,
  transparent: opacity < 0.99, opacity, depthWrite: opacity >= 0.99,
  side: THREE.DoubleSide
});
const pointMaterialFor = (color, opacity) => new THREE.PointsMaterial({
  color: new THREE.Color(color), size: 0.12, sizeAttenuation: true,
  transparent: opacity < 0.99, opacity, depthWrite: false
});

function notify(text, duration = 2400) {
  const toast = $('toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}
function showViewerMessage(text) {
  const el = $('viewer-message');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}
function fileExtension(url) {
  const clean = String(url).split('?')[0].toLowerCase();
  const index = clean.lastIndexOf('.');
  return index >= 0 ? clean.slice(index) : '';
}
function geometryFromParsed(parsed) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(parsed.positions, 3));
  if (parsed.indices.length) geometry.setIndex(parsed.indices);
  if (parsed.geometryType === 'surface-mesh') geometry.computeVertexNormals();
  return geometry;
}
async function fileLoader(url, ext, sourceBuffer = null) {
  if (ext === '.ply') return plyLoader.parse(sourceBuffer || await (await fetch(url)).arrayBuffer());
  if (ext === '.stl') return stlLoader.parse(sourceBuffer || await (await fetch(url)).arrayBuffer());
  const text = sourceBuffer ? new TextDecoder().decode(sourceBuffer) : await (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not read mesh resource: ' + url);
    return response.text();
  })();
  return geometryFromParsed(parseMeshText(text, ext));
}
async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function vertexCount(geometry) {
  return geometry.attributes.position ? geometry.attributes.position.count : 0;
}
function triangleCount(geometry) {
  return Math.round((geometry.index?.count || vertexCount(geometry)) / 3);
}
function meshIntegrityLabel(check, geometry) {
  if (check.closed) return 'Closed · ' + triangleCount(geometry).toLocaleString() + ' triangles';
  const details = [];
  if (check.open) details.push(check.open + ' open edges');
  if (check.nonManifold) details.push(check.nonManifold + ' non-manifold edges');
  if (check.inconsistentWinding) details.push(check.inconsistentWinding + ' winding conflicts');
  if (check.degenerate) details.push(check.degenerate + ' degenerate faces');
  if (check.components > 1) details.push(check.components + ' disconnected components');
  if (check.invalid) details.push('invalid coordinates/topology');
  if (check.signedVolumeMm3 <= 1e-9 && !check.invalid) details.push('non-positive volume');
  return details.join(' · ') || 'Mesh integrity failed';
}
function visibleSceneCount() {
  return meshes.filter((m) => m.visible).length + (designMesh && designMesh.visible ? 1 : 0);
}
function updateSceneCount() {
  $('mesh-count').textContent = visibleSceneCount() + ' mesh' + (visibleSceneCount() === 1 ? '' : 'es');
}
function fitCamera(targetObject = null, viewDirection = null) {
  const visible = targetObject ? [targetObject] : meshes.filter((m) => m.visible).concat(designMesh && designMesh.visible ? [designMesh] : []);
  const box = new THREE.Box3();
  visible.forEach((obj) => box.expandByObject(obj));
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  controls.target.copy(sphere.center);
  const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const dist = Math.max(sphere.radius / Math.sin(halfFov) * 1.22, 14);
  const direction = viewDirection ? viewDirection.clone().normalize() : new THREE.Vector3(0.8, -1.15, 0.86).normalize();
  camera.position.copy(sphere.center).add(direction.multiplyScalar(dist));
  camera.near = Math.max(dist / 1000, 0.01);
  camera.far = Math.max(dist * 12, 100);
  camera.updateProjectionMatrix();
  controls.update();
}
function updateMeshList() {
  const container = $('mesh-list');
  container.replaceChildren();
  for (const mesh of meshes) {
    const row = document.createElement('label');
    row.className = 'mesh-row';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = mesh.visible;
    toggle.addEventListener('change', () => {
      mesh.visible = toggle.checked;
      updateSceneCount();
    });
    const swatch = document.createElement('i');
    swatch.className = 'mesh-swatch';
    swatch.style.background = roleColors[mesh.userData.role] || '#93a6a4';
    const name = document.createElement('span');
    name.className = 'mesh-name';
    name.textContent = mesh.userData.name;
    const info = document.createElement('span');
    info.className = 'mesh-info';
    info.textContent = mesh.userData.geometryType === 'point-cloud'
      ? (vertexCount(mesh.geometry) / 1000).toFixed(0) + 'k pts'
      : (triangleCount(mesh.geometry) / 1000).toFixed(0) + 'k tri';
    row.append(toggle, swatch, name, info);
    container.append(row);
  }
  updateSceneCount();
  updateCaseInputStatus();
}
async function loadMesh(record) {
  const ext = fileExtension(record.url);
  if (!ACCEPTED_EXTENSIONS.includes(ext)) throw new Error('Unsupported scan format: ' + ext);
  const response = await fetch(record.url);
  if (!response.ok) throw new Error('Could not read mesh resource: ' + record.url);
  const sourceBuffer = await response.arrayBuffer();
  const sourceSha256 = await sha256Hex(sourceBuffer);
  if (record.sha256 && record.sha256 !== sourceSha256) throw new Error('Mesh hash does not match the saved case manifest: ' + record.name);
  const geometry = await fileLoader(record.url, ext, sourceBuffer);
  const geometryType = record.geometryType || (POINT_CLOUD_EXTENSIONS.includes(ext) ? 'point-cloud' : 'surface-mesh');
  const unitToMm = Number.isFinite(record.unitToMm) && record.unitToMm > 0 ? record.unitToMm : 1;
  if (unitToMm !== 1) geometry.scale(unitToMm, unitToMm, unitToMm);
  if (geometryType === 'surface-mesh' && !geometry.attributes.normal) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const opacity = record.opacity == null ? 1 : record.opacity;
  const mesh = geometryType === 'point-cloud'
    ? new THREE.Points(geometry, pointMaterialFor(record.color || roleColors[record.role] || '#93a6a4', opacity))
    : new THREE.Mesh(geometry, materialFor(record.color || roleColors[record.role] || '#93a6a4', opacity));
  mesh.name = record.name;
  mesh.userData = { ...record, geometryType, sha256: sourceSha256, unit: 'mm', unitToMm, unitProvenance: record.unitProvenance || 'Assumed millimetres; verify source before use', originalGeometry: geometry };
  mesh.visible = record.visible !== false;
  if (Array.isArray(record.transform?.position)) mesh.position.fromArray(record.transform.position);
  if (Array.isArray(record.transform?.rotation)) mesh.rotation.fromArray(record.transform.rotation);
  if (Array.isArray(record.transform?.scale)) mesh.scale.fromArray(record.transform.scale);
  mesh.updateMatrixWorld(true);
  scene.add(mesh);
  meshes.push(mesh);
  return mesh;
}
function setDesignStatus(message, icon = '○') {
  const host = $('design-status');
  host.innerHTML = '';
  const mark = document.createElement('span');
  mark.className = 'status-icon';
  mark.textContent = icon;
  const label = document.createElement('span');
  label.textContent = message;
  host.append(mark, label);
}
function setQc(id, text, kind = 'pending') {
  const item = $(id);
  item.textContent = text;
  item.className = 'qc-' + kind;
}
function setApprovalStatus(message, kind = 'pending') {
  const item = $('approval-status');
  if (!item) return;
  item.textContent = message;
  item.className = 'approval-status ' + kind;
}
function updateApprovalUI() {
  const current = Boolean(approvalRecord && savedDesignHash && approvalRecord.designFingerprint === savedDesignHash && designMesh && !designIsStale() && $('review-confirm')?.checked);
  if (current) {
    setApprovalStatus('Approved by ' + approvalRecord.reviewerName + ' · ' + approvalRecord.approvalId, 'approved');
  } else {
    setApprovalStatus('Not approved for CAM handoff', 'pending');
  }
  if ($('approval-button')) $('approval-button').disabled = !designMesh || !lastDesignClosed || designIsStale();
  if ($('cam-handoff-button')) $('cam-handoff-button').disabled = !current;
}
function clearApprovalState() {
  approvalRecord = null;
  updateApprovalUI();
}
function clearDesign() {
  generationToken++;
  if (designMesh) {
    scene.remove(designMesh);
    designMesh.geometry.dispose();
    designMesh.material.dispose();
    if (designMesh.userData.outerGeometry) designMesh.userData.outerGeometry.dispose();
    designMesh = null;
  }
  $('export-button').disabled = true;
  $('export-button-side').disabled = true;
  $('review-confirm').checked = false;
  designSnapshot = null;
  savedDesignHash = null;
  lastDesignClosed = false;
  clearApprovalState();
  setQc('qc-fit', 'Pending', 'pending');
  setQc('qc-closed', 'Pending', 'pending');
  setQc('qc-wall', 'Pending', 'pending');
  setQc('qc-occlusion', 'Unverified', 'warn');
  setDesignStatus('No design generated yet');
  updateSceneCount();
}
function getPrepMesh() {
  return meshes.find((m) => m.userData.role === 'prep');
}
function getOpposingMesh() {
  return meshes.find((m) => m.userData.role === 'opposing');
}
function getReferenceMesh() {
  return meshes.find((m) => m.userData.role === 'reference');
}
function currentDesignInputs() {
  const prep = getPrepMesh();
  const opposing = getOpposingMesh();
  return {
    prep: prep ? {
      url: prep.userData.url,
      sha256: prep.userData.sha256,
      unitToMm: prep.userData.unitToMm || 1,
      position: prep.position.toArray(),
      rotation: prep.rotation.toArray(),
      scale: prep.scale.toArray()
    } : null,
    opposing: opposing ? {
      url: opposing.userData.url,
      sha256: opposing.userData.sha256,
      unitToMm: opposing.userData.unitToMm || 1,
      position: opposing.position.toArray(),
      rotation: opposing.rotation.toArray(),
      scale: opposing.scale.toArray(),
      userMarkedBiteRegistrationChecked: $('bite-verified').checked
    } : null,
    reliefMm: Number($('clearance').value),
    trimDepthMm: Number($('margin').value),
    envelopeExpansionMm: Number($('wall').value),
    cuspAmplitude: Number($('anatomy').value),
    designSource: $('design-source').value,
    designBrief: {
      toothId: $('brief-tooth-id')?.value.trim() || '',
      dentition: $('brief-dentition')?.value || 'permanent',
      arch: $('brief-arch')?.value || 'maxillary',
      restorationType: $('brief-restoration-type')?.value || 'single-crown',
      anatomyReference: $('brief-reference')?.value || 'procedural'
    }
  };
}
function validateDesignBrief(requireTooth = false) {
  const toothId = $('brief-tooth-id')?.value.trim() || '';
  const dentition = $('brief-dentition')?.value || 'permanent';
  if ($('brief-restoration-type')?.value === 'abutment-review') return 'Abutment design is currently a brief-only, non-manufacturing path. Select single crown preview for geometry generation.';
  if (!toothId && !requireTooth) return null;
  if (!/^\d{2}$/.test(toothId)) return 'Enter a two-digit FDI tooth designation, or leave it unassigned for a geometry preview.';
  const value = Number(toothId);
  const validPermanent = (value >= 11 && value <= 18) || (value >= 21 && value <= 28) || (value >= 31 && value <= 38) || (value >= 41 && value <= 48);
  const validPrimary = (value >= 51 && value <= 55) || (value >= 61 && value <= 65) || (value >= 71 && value <= 75) || (value >= 81 && value <= 85);
  if ((dentition === 'permanent' && !validPermanent) || (dentition === 'primary' && !validPrimary)) return 'The tooth number does not match the selected dentition.';
  return null;
}
function validateNumericInputs() {
  for (const id of ['clearance', 'margin', 'wall', 'anatomy', 'opp-x', 'opp-y', 'opp-z', 'opp-rx', 'opp-ry', 'opp-rz']) {
    const input = $(id);
    const value = Number(input.value);
    if (!Number.isFinite(value)) return input.id + ' must be a finite number.';
    if (input.min !== '' && value < Number(input.min) || input.max !== '' && value > Number(input.max)) return input.id + ' is outside its allowed range.';
  }
  return null;
}
function designIsStale() {
  return Boolean(designMesh) && (!designSnapshot || JSON.stringify(currentDesignInputs()) !== JSON.stringify(designSnapshot));
}
function refreshDesignFreshness() {
  if (!designMesh) return;
  const stale = designIsStale();
  if (stale) {
    $('review-confirm').checked = false;
    if (approvalRecord) clearApprovalState();
    setQc('qc-fit', 'Inputs changed · regenerate', 'warn');
    setDesignStatus('Preview stale · regenerate before review', '!');
  } else {
    setQc('qc-fit', 'Boolean completed · fit NOT EVALUATED', 'warn');
    setDesignStatus(lastDesignClosed ? 'Proposal preview generated · fit NOT EVALUATED' : 'Preview mesh integrity failed', '!');
  }
  const canExport = lastDesignClosed && !stale && $('review-confirm').checked;
  $('export-button').disabled = !canExport;
  $('export-button-side').disabled = !canExport;
  updateApprovalUI();
}
function updateCaseInputStatus() {
  const present = (id, value) => {
    const item = $(id);
    item.textContent = value ? 'Present' : 'Missing';
    item.className = value ? 'check' : 'warn';
  };
  present('status-arch', meshes.some((mesh) => ['upper', 'preop'].includes(mesh.userData.role)));
  present('status-prep', Boolean(getPrepMesh()));
  present('status-opposing', Boolean(getOpposingMesh()));
  const reference = getReferenceMesh();
  $('reference-status').textContent = reference
    ? 'Reference mesh loaded. Placement uses a bounding-box fit into the preparation frame; registration remains unverified.'
    : 'No reference crown is loaded. The procedural fallback is a generic research shell.';
  if (!reference && $('design-source').value === 'reference') $('design-source').value = 'procedural';
  const training = isLegacyTrainingCase();
  const toothId = $('brief-tooth-id')?.value.trim();
  $('tooth-label').textContent = training ? 'Training label #3' : toothId ? 'FDI ' + toothId : 'Not assigned';
  $('restoration-tooth-badge').textContent = training ? '3' : toothId || '—';
  $('restoration-tooth-label').textContent = training ? 'Training tooth #3' : toothId ? 'FDI tooth ' + toothId : 'Tooth not assigned';
  $('restoration-sub-label').textContent = $('brief-restoration-type')?.value === 'abutment-review' ? 'Abutment review · non-manufacturing' : training ? 'Practice case · crown preview' : 'Single crown preview';
}

function signedVolume(geometry) {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  let volume6 = 0;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), cross = new THREE.Vector3();
  const read = (n, out) => {
    const i = index ? index.getX(n) : n;
    return out.fromBufferAttribute(pos, i);
  };
  for (let t = 0; t < triCount; t++) {
    read(t * 3, v0); read(t * 3 + 1, v1); read(t * 3 + 2, v2);
    cross.crossVectors(v1, v2);
    volume6 += v0.dot(cross);
  }
  return volume6 / 6;
}
function solidGeometry(source, weldTolerance = 0.00001, filterDegenerate = true) {
  const positionOnly = source.clone();
  for (const key of Object.keys(positionOnly.attributes)) {
    if (key !== 'position') positionOnly.deleteAttribute(key);
  }
  positionOnly.clearGroups();
  const geometry = mergeVertices(positionOnly, weldTolerance);
  positionOnly.dispose();
  if (!geometry.index) throw new Error('Unable to weld mesh vertices.');
  if (filterDegenerate) {
    const filtered = [];
    const pos = geometry.attributes.position;
    const index = geometry.index;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cross = new THREE.Vector3();
    for (let i = 0; i < index.count; i += 3) {
      const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
      if (ia === ib || ib === ic || ia === ic) continue;
      a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
      cross.subVectors(b, a).cross(c.subVectors(c, a));
      if (cross.lengthSq() <= 1e-14) continue;
      filtered.push(ia, ib, ic);
    }
    if (filtered.length !== index.count) geometry.setIndex(filtered);
  }
  if (signedVolume(geometry) < 0) {
    const array = geometry.index.array;
    for (let i = 0; i < array.length; i += 3) {
      const a = array[i + 1]; array[i + 1] = array[i + 2]; array[i + 2] = a;
    }
    geometry.index.needsUpdate = true;
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
function offsetSolid(source, relief) {
  const geometry = solidGeometry(source, 0.00002, false);
  const p = geometry.attributes.position;
  const n = geometry.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + n.getX(i) * relief, p.getY(i) + n.getY(i) * relief, p.getZ(i) + n.getZ(i) * relief);
  }
  p.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
async function manifoldDifference(outerGeometry, innerGeometry) {
  if (!manifoldWasm) {
    manifoldWasm = await ManifoldModule({ locateFile: (file) => file.endsWith('.wasm') ? manifoldWasmUrl : file });
    manifoldWasm.setup();
  }
  function makeManifold(geometry, label) {
    let solid = geometry.index ? geometry.clone() : null;
    const directTopology = solid ? closureCheck(solid) : null;
    if (!solid || !directTopology.closed || directTopology.nonManifold > 0 || directTopology.degenerate > 0) {
      solid?.dispose();
      solid = solidGeometry(geometry, 0.00002);
    }
    console.info('solid input ' + label + ': ' + JSON.stringify({ topology: closureCheck(solid), volume: signedVolume(solid), verts: solid.attributes.position.count, tris: solid.index ? solid.index.count / 3 : 0 }));
    if (!solid.index) throw new Error('Boolean input is not indexed.');
    const inputMesh = new manifoldWasm.Mesh({
      numProp: 3,
      vertProperties: new Float32Array(solid.attributes.position.array),
      triVerts: new Uint32Array(solid.index.array),
      tolerance: 0.00001
    });
    try {
      const manifold = manifoldWasm.Manifold.ofMesh(inputMesh);
      const status = manifold.status();
      if (status !== 'NoError') {
        manifold.delete();
        throw new Error('Solid validation failed: ' + status);
      }
      return manifold;
    } finally {
      solid.dispose();
    }
  }
  const outer = makeManifold(outerGeometry, 'outer');
  const inner = makeManifold(innerGeometry, 'intaglio');
  let result = null;
  let meshData = null;
  try {
    result = outer.subtract(inner);
    const status = result.status();
    if (status !== 'NoError') throw new Error('Solid difference failed: ' + status);
    meshData = result.getMesh();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(meshData.vertProperties), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(meshData.triVerts), 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  } finally {
    if (meshData && typeof meshData.delete === 'function') meshData.delete();
    if (result) result.delete();
    outer.delete();
    inner.delete();
  }
}
function makeCrownOuter(prepGeometry, wall, anatomy, marginDepth) {
  const box = prepGeometry.boundingBox || new THREE.Box3().setFromBufferAttribute(prepGeometry.attributes.position);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const marginZ = box.max.z - marginDepth;
  const height = Math.max(5.7, Math.min(8.6, 6.25 + wall * 0.48));
  const rx = Math.max(size.x * 0.5 + wall, 4.5);
  const ry = Math.max(size.y * 0.5 + wall, 4.4);
  const sideRings = 30, radialSteps = 12, segments = 96;
  const positions = [], indices = [];
  const push = (x, y, z) => { positions.push(x, y, z); return positions.length / 3 - 1; };
  const side = [];
  for (let ring = 0; ring <= sideRings; ring++) {
    const t = ring / sideRings;
    const radial = 0.82 + 0.2 * Math.sin(Math.PI * t) - 0.025 * t;
    const z = marginZ + height * t;
    const row = [];
    for (let j = 0; j < segments; j++) {
      const a = j / segments * Math.PI * 2;
      row.push(push(center.x + rx * radial * Math.cos(a), center.y + ry * radial * Math.sin(a), z));
    }
    side.push(row);
  }
  for (let r = 0; r < sideRings; r++) {
    for (let j = 0; j < segments; j++) {
      const jn = (j + 1) % segments;
      const a = side[r][j], b = side[r][jn], c = side[r + 1][jn], d = side[r + 1][j];
      indices.push(a, b, c, a, c, d);
    }
  }
  const bottomCenter = push(center.x, center.y, marginZ);
  for (let j = 0; j < segments; j++) {
    const jn = (j + 1) % segments;
    indices.push(bottomCenter, side[0][jn], side[0][j]);
  }
  const baseTopRing = side[sideRings];
  const topRows = [baseTopRing];
  function cuspHeight(x, y, r) {
    const scale = anatomy / 100;
    const peaks = [[-0.42, -0.42], [-0.42, 0.42], [0.42, -0.42], [0.42, 0.42]];
    let h = -0.82 * scale * Math.exp(-(r * r) / 0.035) * (1 - r);
    for (const c of peaks) {
      const d2 = (x - c[0]) ** 2 + (y - c[1]) ** 2;
      h += 4.8 * scale * Math.exp(-d2 / 0.018) * (1 - r) ** 1.25;
    }
    return h;
  }
  for (let k = 1; k <= radialSteps; k++) {
    const r = 1 - k / radialSteps;
    const row = [];
    if (k === radialSteps) {
      row.push(push(center.x, center.y, marginZ + height + cuspHeight(0, 0, 0)));
      topRows.push(row);
      continue;
    }
    for (let j = 0; j < segments; j++) {
      const a = j / segments * Math.PI * 2;
      const x = r * Math.cos(a), y = r * Math.sin(a);
      row.push(push(center.x + rx * 0.795 * x, center.y + ry * 0.795 * y, marginZ + height + cuspHeight(x, y, r)));
    }
    topRows.push(row);
  }
  for (let k = 0; k < radialSteps; k++) {
    const outer = topRows[k];
    const inner = topRows[k + 1];
    for (let j = 0; j < segments; j++) {
      const jn = (j + 1) % segments;
      if (inner.length === 1) {
        indices.push(inner[0], outer[j], outer[jn]);
      } else {
        indices.push(inner[j], outer[j], outer[jn], inner[j], outer[jn], inner[jn]);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.clearGroups();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  if (signedVolume(geometry) < 0) {
    const array = geometry.index.array;
    for (let i = 0; i < array.length; i += 3) {
      const a = array[i + 1]; array[i + 1] = array[i + 2]; array[i + 2] = a;
    }
    geometry.index.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  return geometry;
}
function capOpenBoundaries(geometry) {
  if (!geometry.index) return geometry;
  const index = geometry.index.array;
  const edges = new Map();
  const addEdge = (from, to) => {
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const key = `${lo}:${hi}`;
    const entry = edges.get(key);
    if (entry) entry.count += 1;
    else edges.set(key, { count: 1, from, to });
  };
  for (let i = 0; i < index.length; i += 3) {
    addEdge(index[i], index[i + 1]);
    addEdge(index[i + 1], index[i + 2]);
    addEdge(index[i + 2], index[i]);
  }
  const boundary = [...edges.values()].filter((edge) => edge.count === 1);
  if (!boundary.length) return geometry;
  const incident = new Map();
  boundary.forEach((edge, edgeIndex) => {
    for (const vertex of [edge.from, edge.to]) {
      const list = incident.get(vertex) || [];
      list.push(edgeIndex);
      incident.set(vertex, list);
    }
  });
  const used = new Set();
  const loops = [];
  for (let startIndex = 0; startIndex < boundary.length; startIndex++) {
    if (used.has(startIndex)) continue;
    const start = boundary[startIndex];
    const loop = [start.from, start.to];
    let previousVertex = start.from;
    let currentVertex = start.to;
    used.add(startIndex);
    let closed = false;
    for (let guard = 0; guard <= boundary.length; guard++) {
      if (currentVertex === loop[0]) { closed = true; break; }
      const candidates = (incident.get(currentVertex) || []).filter((candidate) => !used.has(candidate));
      const nextEdgeIndex = candidates[0];
      if (nextEdgeIndex === undefined) break;
      used.add(nextEdgeIndex);
      const edge = boundary[nextEdgeIndex];
      const nextVertex = edge.from === currentVertex ? edge.to : edge.from;
      previousVertex = currentVertex;
      currentVertex = nextVertex;
      loop.push(currentVertex);
    }
    if (closed && loop.length >= 4) loops.push(loop.slice(0, -1));
  }
  if (!loops.length) return geometry;
  const pos = geometry.attributes.position;
  const positions = Array.from(pos.array);
  const newIndices = Array.from(index);
  const center = new THREE.Vector3();
  for (const loop of loops) {
    center.set(0, 0, 0);
    for (const vertexIndex of loop) center.add(new THREE.Vector3().fromBufferAttribute(pos, vertexIndex));
    center.multiplyScalar(1 / loop.length);
    const centerIndex = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    for (let i = 0; i < loop.length; i++) {
      const from = loop[i], to = loop[(i + 1) % loop.length];
      newIndices.push(centerIndex, from, to);
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(newIndices);
  if (signedVolume(geometry) < 0) {
    const array = geometry.index.array;
    for (let i = 0; i < array.length; i += 3) {
      const swap = array[i + 1]; array[i + 1] = array[i + 2]; array[i + 2] = swap;
    }
    geometry.index.needsUpdate = true;
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
function makeReferenceOuter(referenceGeometry, prepGeometry, wall, marginDepth) {
  let geometry = solidGeometry(referenceGeometry, 0.00002);
  const sourceTopology = closureCheck(geometry);
  if (!sourceTopology.closed || sourceTopology.nonManifold > 0 || sourceTopology.degenerate > 0) {
    const points = [];
    const sourcePosition = geometry.attributes.position;
    for (let i = 0; i < sourcePosition.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(sourcePosition, i));
    const hull = new ConvexGeometry(points);
    geometry.dispose();
    geometry = capOpenBoundaries(solidGeometry(hull, 0.00002));
    hull.dispose();
  }
  geometry.computeBoundingBox();
  prepGeometry.computeBoundingBox();
  const sourceBox = geometry.boundingBox;
  const prepBox = prepGeometry.boundingBox;
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const prepSize = prepBox.getSize(new THREE.Vector3());
  const sourceCenter = sourceBox.getCenter(new THREE.Vector3());
  const prepCenter = prepBox.getCenter(new THREE.Vector3());
  const sourceWidth = Math.max(sourceSize.x, sourceSize.y);
  const targetWidth = Math.max(prepSize.x, prepSize.y) + wall * 2;
  if (!(sourceWidth > 0) || !(targetWidth > 0)) throw new Error('Reference crown or prep bounds are invalid.');
  const scale = targetWidth / sourceWidth;
  geometry.applyMatrix4(new THREE.Matrix4().makeScale(scale, scale, scale));
  const marginZ = prepBox.max.z - marginDepth;
  geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(
    prepCenter.x - sourceCenter.x * scale,
    prepCenter.y - sourceCenter.y * scale,
    marginZ - sourceBox.min.z * scale
  ));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  if (signedVolume(geometry) < 0) {
    const array = geometry.index.array;
    for (let i = 0; i < array.length; i += 3) { const swap = array[i + 1]; array[i + 1] = array[i + 2]; array[i + 2] = swap; }
    geometry.index.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  return geometry;
}
const closureCheck = inspectClosedMesh;
function nearestAntagonistSample(geometry) {
  const opponent = getOpposingMesh();
  if (!opponent) return null;
  try {
    opponent.updateMatrixWorld(true);
    const toOpponentLocal = opponent.matrixWorld.clone().invert();
    const bvh = new MeshBVH(opponent.geometry);
    const pos = geometry.attributes.position;
    const stride = Math.max(1, Math.floor(pos.count / 700));
    const p = new THREE.Vector3();
    let minDistance = Infinity;
    for (let i = 0; i < pos.count; i += stride) {
      p.fromBufferAttribute(pos, i).applyMatrix4(toOpponentLocal);
      const hit = bvh.closestPointToPoint(p);
      if (hit && hit.distance < minDistance) minDistance = hit.distance;
    }
    return Number.isFinite(minDistance) ? minDistance : null;
  } catch {
    return null;
  }
}
function updateBiteSummary() {
  const marked = $('bite-verified').checked;
  $('bite-check-status').textContent = marked ? 'User marked checked' : 'Unverified';
  $('bite-check-status').className = marked ? 'warn' : 'warn';
  if (lastOcclusionGap !== null) {
    $('qc-occlusion').textContent = lastOcclusionGap.toFixed(2) + ' mm unsigned sample · ' + (marked ? 'user note only' : 'unverified');
    $('qc-occlusion').className = 'qc-warn';
  }
  refreshDesignFreshness();
}
function applyOpposingTransform() {
  const opponent = getOpposingMesh();
  if (!opponent) return;
  opponent.position.set(Number($('opp-x').value) || 0, Number($('opp-y').value) || 0, Number($('opp-z').value) || 0);
  opponent.rotation.set(THREE.MathUtils.degToRad(Number($('opp-rx').value) || 0), THREE.MathUtils.degToRad(Number($('opp-ry').value) || 0), THREE.MathUtils.degToRad(Number($('opp-rz').value) || 0), 'XYZ');
  opponent.updateMatrixWorld(true);
  if (designMesh && designMesh.userData.outerGeometry) {
    setQc('qc-occlusion', 'Updating sample…', 'warn');
    clearTimeout(alignmentTimer);
    alignmentTimer = setTimeout(() => {
      lastOcclusionGap = nearestAntagonistSample(designMesh.userData.outerGeometry);
      updateBiteSummary();
    }, 250);
  }
  updateBiteSummary();
}
async function generateProposal() {
  if (isBusy || isImporting || isSwitchingCase) return;
  const prep = getPrepMesh();
  if (!prep) {
    notify('Load a preparation mesh first.');
    return;
  }
  if (prep.userData.geometryType !== 'surface-mesh') {
    notify('The preparation must be a surface mesh. Point clouds are accepted for inspection and registration preparation, not Boolean generation.', 4500);
    return;
  }
  const inputError = validateDesignBrief(false) || validateNumericInputs();
  if (inputError) {
    notify(inputError, 4200);
    return;
  }
  const requestCaseId = caseData?.id;
  const requestInputs = JSON.stringify(currentDesignInputs());
  const requestToken = ++generationToken;
  isBusy = true;
  $('generate-button').disabled = true;
  setDesignStatus('Building outer anatomy and intaglio…', '◌');
  let prepLocalGeometry = null;
  let outer = null;
  let inner = null;
  let referenceLocalGeometry = null;
  let prepWorldMatrix = null;
  try {
    await new Promise((resolve) => setTimeout(resolve, 40));
    if (requestToken !== generationToken || caseData?.id !== requestCaseId || JSON.stringify(currentDesignInputs()) !== requestInputs) {
      notify('Design inputs changed before generation started. Run it again with the current case.');
      return;
    }
    prep.updateMatrixWorld(true);
    prepWorldMatrix = prep.matrixWorld.clone();
    const prepWorldScale = prep.getWorldScale(new THREE.Vector3());
    if (prepWorldScale.distanceTo(new THREE.Vector3(1, 1, 1)) > 0.0001) {
      throw new Error('The prep has a non-unit object scale. Apply source units in the import step; do not scale the prep object.');
    }
    prepLocalGeometry = prep.geometry.clone();
    prepLocalGeometry.computeBoundingBox();
    if (!closureCheck(prepLocalGeometry).closed) {
      throw new Error('The prep scan is open or non-manifold. Assign a watertight preparation mesh before crown generation.');
    }
    const relief = Number($('clearance').value);
    const wall = Number($('wall').value);
    const anatomy = Number($('anatomy').value);
    const marginDepth = Number($('margin').value);
    let sourceMode = $('design-source').value;
    const reference = getReferenceMesh();
    if (sourceMode === 'reference' && !reference) throw new Error('Choose a procedural fallback or load a closed reference crown first.');
    if (sourceMode === 'reference' && reference?.userData.geometryType !== 'surface-mesh') throw new Error('The selected reference must be a surface mesh. Choose the procedural fallback for a point-cloud reference.');
    if (sourceMode === 'reference') {
      reference.updateMatrixWorld(true);
      referenceLocalGeometry = reference.geometry.clone();
      referenceLocalGeometry.applyMatrix4(reference.matrixWorld);
      referenceLocalGeometry.applyMatrix4(prepWorldMatrix.clone().invert());
      outer = makeReferenceOuter(referenceLocalGeometry, prepLocalGeometry, wall, marginDepth);
      const referenceTopology = closureCheck(outer);
      if (!referenceTopology.closed || referenceTopology.nonManifold > 0 || referenceTopology.degenerate > 0) {
        outer.dispose();
        outer = solidGeometry(makeCrownOuter(prepLocalGeometry, wall, anatomy, marginDepth));
        sourceMode = 'procedural-fallback';
        notify('The reference surface is open; using a closed procedural preview and keeping export review-only.', 5000);
      }
    } else {
      outer = solidGeometry(makeCrownOuter(prepLocalGeometry, wall, anatomy, marginDepth));
    }
    inner = offsetSolid(prepLocalGeometry, relief);
    const innerTopology = closureCheck(inner);
    if (!innerTopology.closed || innerTopology.nonManifold > 0 || innerTopology.degenerate > 0) {
      inner.dispose();
      inner = solidGeometry(prepLocalGeometry.clone());
      notify('The offset preparation produced an open surface; using the closed die for this review preview.', 5000);
    }
    const designGeometry = await manifoldDifference(outer, inner);
    if (requestToken !== generationToken || caseData?.id !== requestCaseId || JSON.stringify(currentDesignInputs()) !== requestInputs) {
      designGeometry.dispose();
      outer.dispose(); outer = null;
      inner.dispose(); inner = null;
      notify('Case or design inputs changed during generation. The result was discarded; generate again.');
      return;
    }
    inner.dispose();
    inner = null;
    designGeometry.applyMatrix4(prepWorldMatrix);
    outer.applyMatrix4(prepWorldMatrix);
    designGeometry.clearGroups();
    if (!designGeometry.attributes.normal) designGeometry.computeVertexNormals();
    designGeometry.computeBoundingBox();
    designGeometry.computeBoundingSphere();
    const meshCheck = closureCheck(designGeometry);
    if (designMesh) {
      scene.remove(designMesh);
      designMesh.geometry.dispose();
      designMesh.material.dispose();
      if (designMesh.userData.outerGeometry) designMesh.userData.outerGeometry.dispose();
    }
    const mat = materialFor(roleColors.crown, 1);
    mat.side = THREE.DoubleSide;
    designMesh = new THREE.Mesh(designGeometry, mat);
    designMesh.name = 'OpenCusp crown proposal with intaglio';
    designMesh.userData.role = 'crown';
    designMesh.userData.outerGeometry = outer;
    scene.add(designMesh);
    savedDesignHash = null;
    clearApprovalState();
    designSnapshot = JSON.parse(requestInputs);
    lastDesignClosed = meshCheck.closed;
    if (!isIsolated) {
      meshes.forEach((m) => { if (m.userData.role === 'reference') m.visible = false; });
    }
    $('qc-fit').textContent = sourceMode === 'reference' ? 'Reference-guided Boolean · fit not measured' : sourceMode === 'procedural-fallback' ? 'Closed procedural fallback · reference surface open' : 'Procedural Boolean · fit not measured';
    $('qc-fit').className = 'qc-warn';
    $('qc-closed').textContent = meshIntegrityLabel(meshCheck, designGeometry);
    $('qc-closed').className = meshCheck.closed ? 'qc-good' : 'qc-warn';
    $('qc-wall').textContent = wall.toFixed(1) + ' mm input · unmeasured';
    $('qc-wall').className = 'qc-warn';
    setQc('qc-occlusion', 'Registration unverified', 'warn');
    lastOcclusionGap = nearestAntagonistSample(outer);
    updateBiteSummary();
    const canExport = meshCheck.closed && !designIsStale();
    $('export-button').disabled = !canExport || !$('review-confirm').checked;
    $('export-button-side').disabled = !canExport || !$('review-confirm').checked;
    setDesignStatus(meshCheck.closed ? (sourceMode === 'reference' ? 'Reference-guided preview · fit NOT EVALUATED' : sourceMode === 'procedural-fallback' ? 'Closed fallback preview · reference open' : 'Procedural preview · fit NOT EVALUATED') : 'Preview generated · mesh closure failed', '!');
    updateApprovalUI();
    fitCamera(designMesh);
    updateSceneCount();
    if (meshCheck.closed) notify('3D crown proposal generated. Review all surfaces before use.');
    else notify('The generated mesh has open or non-manifold edges; STL export is blocked.', 4000);
  } catch (error) {
    console.error(error);
    setDesignStatus('Geometry operation failed · adjust prep or trim level', '!');
    notify(error.message || 'Could not create the intaglio Boolean. Check the preparation mesh.', 4500);
    setQc('qc-fit', 'Boolean failed', 'warn');
    setQc('qc-closed', 'Not checked', 'warn');
  } finally {
    prepLocalGeometry?.dispose();
    referenceLocalGeometry?.dispose();
    inner?.dispose();
    isBusy = false;
    $('generate-button').disabled = false;
  }
}
function meshBounds(geometry) {
  geometry.computeBoundingBox();
  return geometry.boundingBox ? {
    min: geometry.boundingBox.min.toArray(),
    max: geometry.boundingBox.max.toArray()
  } : null;
}
function serializeDesign(generatedMesh = null) {
  const sources = meshes.map((mesh) => ({
    name: mesh.userData.name,
    role: mesh.userData.role,
    url: mesh.userData.url,
    sha256: mesh.userData.sha256,
    unit: mesh.userData.unit || 'mm',
    unitToMm: mesh.userData.unitToMm || 1,
    unitProvenance: mesh.userData.unitProvenance || 'Assumed millimetres; verify source before use',
    visible: mesh.visible,
    transform: { position: mesh.position.toArray(), rotation: mesh.rotation.toArray(), scale: mesh.scale.toArray() },
    bounds: meshBounds(mesh.geometry)
  }));
  return {
    product: 'OpenCusp Dental CAD',
    version: '0.1.0',
    schemaVersion: 1,
    unit: 'mm',
    caseId: caseData.id,
    caseTitle: caseData.title,
    restoration: 'single-crown-geometry-preview',
    tooth: isLegacyTrainingCase() ? 'training label #3; not tooth-library driven' : null,
    toothStatus: isLegacyTrainingCase() ? 'TRAINING_LABEL_ONLY' : 'UNASSIGNED',
    materialIntent: 'not-applied',
    sources,
    currentDesignInputs: currentDesignInputs(),
    generationInputs: designSnapshot,
    designStale: designIsStale(),
    internalReliefMm: Number($('clearance').value),
    finishLineTrimDepthMm: Number($('margin').value),
    axialWallInputMm: Number($('wall').value),
    anatomy: Number($('anatomy').value),
    opposingTransform: { translationMm: [$('opp-x').value, $('opp-y').value, $('opp-z').value].map(Number), rotationDegrees: [$('opp-rx').value, $('opp-ry').value, $('opp-rz').value].map(Number), userMarkedBiteRegistrationChecked: $('bite-verified').checked, registrationStatus: 'NOT_EVALUATED' },
    generated: Boolean(generatedMesh),
    generatedMesh: generatedMesh ? {
      url: generatedMesh.url,
      sha256: generatedMesh.sha256,
      bytes: generatedMesh.bytes,
      triangles: generatedMesh.triangles,
      bounds: generatedMesh.bounds,
      geometryStatus: designIsStale() ? 'STALE_PREVIEW' : 'BOOLEAN_PREVIEW_ONLY',
      generatedWith: designSnapshot,
      fitStatus: 'NOT_EVALUATED',
      marginStatus: 'NOT_EVALUATED',
      wallThicknessStatus: 'NOT_EVALUATED',
      occlusionStatus: 'NOT_EVALUATED',
      materialStatus: 'NOT_EVALUATED',
      camStatus: 'NOT_EVALUATED'
    } : null,
    warning: 'Local engineering preview only. Not clinically validated or ready for manufacturing.'
  };
}
async function saveCase(allowImport = false) {
  if (isImporting && !allowImport) return false;
  try {
    let generatedMeshRecord = null;
    if (designMesh) {
      const exporter = new STLExporter();
      const output = exporter.parse(designMesh, { binary: true });
      const bytes = output instanceof DataView ? output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) : output;
      const meshResponse = await fetch('/api/design/' + encodeURIComponent(caseData.id) + '/mesh', {
        method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes
      });
      const savedMesh = await meshResponse.json();
      if (!meshResponse.ok) throw new Error(savedMesh.error || 'Proposal mesh save failed.');
      generatedMeshRecord = { ...savedMesh, bounds: meshBounds(designMesh.geometry) };
      savedDesignHash = savedMesh.sha256;
    }
    const response = await fetch('/api/design/' + encodeURIComponent(caseData.id), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(serializeDesign(generatedMeshRecord))
    });
    const savedCase = await response.json();
    if (!response.ok) throw new Error(savedCase.error || 'Save request failed.');
    localStorage.setItem('opencusp-active-case-id', caseData.id);
    notify(designMesh ? 'Case and proposal mesh saved locally.' : 'Case settings saved locally.');
    return true;
  } catch (error) {
    console.error(error);
    notify('Could not save the case. It remains open; retry Save before switching or refreshing.', 4200);
    return false;
  }
}
async function restoreSavedCase() {
  const response = await fetch('/api/design/' + encodeURIComponent(caseData.id));
  if (response.status === 404) return false;
  if (!response.ok) throw new Error('Could not read saved case state.');
  const saved = await response.json();
  if (saved.schemaVersion !== 1 || saved.caseId !== caseData.id) {
    notify('An older saved case was found; kept safely but not restored.');
    return false;
  }
  for (const source of saved.sources || []) {
    if (!source.url || meshes.some((mesh) => mesh.userData.url === source.url)) continue;
    const filename = source.url.split('/').pop();
    if (!source.url.startsWith('/user-meshes/') || filename.includes('..')) continue;
    const response = await fetch(source.url, { method: 'HEAD' });
    if (!response.ok) throw new Error('A saved scan is missing: ' + source.name);
    await loadMesh({ ...source, url: source.url, color: roleColors[source.role] || roleColors.scan, opacity: source.role === 'prep' ? 1 : 0.85 });
  }
  for (const mesh of meshes) {
    const savedSource = (saved.sources || []).find((source) => source.url === mesh.userData.url);
    if (!savedSource) continue;
    mesh.visible = savedSource.visible !== false;
    if (Array.isArray(savedSource.transform?.position)) mesh.position.fromArray(savedSource.transform.position);
    if (Array.isArray(savedSource.transform?.rotation)) mesh.rotation.fromArray(savedSource.transform.rotation);
    if (Array.isArray(savedSource.transform?.scale)) mesh.scale.fromArray(savedSource.transform.scale);
    mesh.updateMatrixWorld(true);
  }
  for (const [id, value] of [['clearance', saved.internalReliefMm], ['margin', saved.finishLineTrimDepthMm], ['wall', saved.axialWallInputMm], ['anatomy', saved.anatomy]]) {
    if (Number.isFinite(value)) $(id).value = String(value);
  }
  const brief = saved.currentDesignInputs?.designBrief || {};
  for (const [id, value] of [['brief-tooth-id', brief.toothId], ['brief-dentition', brief.dentition], ['brief-arch', brief.arch], ['brief-restoration-type', brief.restorationType], ['brief-reference', brief.anatomyReference]]) {
    if (value != null && $(id)) $(id).value = String(value);
  }
  if (saved.currentDesignInputs?.designSource && ['reference', 'procedural'].includes(saved.currentDesignInputs.designSource)) $('design-source').value = saved.currentDesignInputs.designSource;
  const translation = saved.opposingTransform?.translationMm || [0, 0, 0];
  const rotation = saved.opposingTransform?.rotationDegrees || [0, 0, 0];
  ['opp-x','opp-y','opp-z'].forEach((id, i) => { $(id).value = String(translation[i] || 0); });
  ['opp-rx','opp-ry','opp-rz'].forEach((id, i) => { $(id).value = String(rotation[i] || 0); });
  $('bite-verified').checked = Boolean(saved.opposingTransform?.userMarkedBiteRegistrationChecked);
  applyOpposingTransform();
  updateRangeLabels();
  const generated = saved.generatedMesh;
  savedDesignHash = generated?.sha256 || null;
  const legacyMeshUrl = '/api/design/' + caseData.id + '/mesh';
  const hashedMeshUrl = legacyMeshUrl + '?sha256=' + generated?.sha256;
  if (generated?.sha256 && [legacyMeshUrl, hashedMeshUrl].includes(generated.url)) {
    const meshResponse = await fetch(generated.url);
    if (!meshResponse.ok) throw new Error('The saved proposal STL is missing.');
    const buffer = await meshResponse.arrayBuffer();
    if (await sha256Hex(buffer) !== generated.sha256) throw new Error('Saved proposal checksum does not match its manifest.');
    const geometry = stlLoader.parse(buffer);
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const pos = geometry.attributes.position.array;
    if (![...pos].every(Number.isFinite)) throw new Error('Saved proposal contains invalid coordinates.');
    designMesh = new THREE.Mesh(geometry, materialFor(roleColors.crown, 1));
    designMesh.name = 'Restored OpenCusp review proposal';
    designMesh.userData.role = 'crown';
    scene.add(designMesh);
    const check = closureCheck(geometry);
    lastDesignClosed = check.closed;
    designSnapshot = generated.generatedWith || null;
    setQc('qc-fit', 'Saved Boolean proposal · fit NOT EVALUATED', 'warn');
    setQc('qc-closed', meshIntegrityLabel(check, geometry), check.closed ? 'good' : 'warn');
    setQc('qc-wall', 'Unmeasured', 'warn');
    setQc('qc-occlusion', 'Registration NOT EVALUATED', 'warn');
    setDesignStatus(designIsStale() ? 'Restored stale proposal · regenerate before review' : 'Restored proposal · fit NOT EVALUATED', '!');
    if (designIsStale()) setQc('qc-fit', 'Saved inputs differ · regenerate', 'warn');
    $('review-confirm').checked = false;
    $('export-button').disabled = true;
    $('export-button-side').disabled = true;
    refreshDesignFreshness();
    if (check.closed) notify('Saved proposal restored and checksum verified. Review is still required.');
  }
  updateMeshList();
  if (designMesh) fitCamera(designMesh);
  await restoreApproval();
  updateApprovalUI();
  return true;
}
async function restoreApproval() {
  approvalRecord = null;
  if (!savedDesignHash || !caseData) return;
  const response = await fetch('/api/design/' + encodeURIComponent(caseData.id) + '/approval');
  if (response.status === 404) return;
  if (!response.ok) throw new Error('Could not read the saved approval record.');
  const value = await response.json();
  if (value.approved === true && value.designFingerprint === savedDesignHash && !designIsStale()) approvalRecord = value;
}
function openApprovalDialog() {
  if (!designMesh || !lastDesignClosed || designIsStale()) return notify('Generate and save a fresh closed proposal before requesting approval.', 4200);
  $('approval-dialog').showModal();
}
async function submitApproval() {
  if (!designMesh || !lastDesignClosed || designIsStale()) return notify('Approval is blocked until the proposal is fresh and closed.', 4200);
  if (!$('review-confirm').checked) return notify('Complete the professional review acknowledgement first.', 4200);
  const briefError = validateDesignBrief(true);
  if (briefError) return notify(briefError, 4200);
  const reviewerName = $('reviewer-name').value.trim();
  const approvalId = $('approval-id').value.trim();
  if (!reviewerName || !approvalId) return notify('Reviewer name and approval ID are required.', 4200);
  if (!savedDesignHash && !(await saveCase())) return;
  const body = {
    approved: true,
    reviewerName,
    reviewerRole: $('reviewer-role').value,
    approvalId,
    note: $('approval-note').value.trim(),
    designFingerprint: savedDesignHash,
    reviewedAt: new Date().toISOString()
  };
  const response = await fetch('/api/design/' + encodeURIComponent(caseData.id) + '/approval', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) return notify(result.error || 'Approval could not be saved.', 4500);
  approvalRecord = result.approval;
  updateApprovalUI();
  notify('Approval recorded. CAM handoff remains profile-gated.');
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function exportObjText(object) {
  const geometry = object.geometry;
  const position = geometry.attributes.position;
  const index = geometry.index?.array;
  const lines = ['# OpenCusp review/CAM handoff OBJ', 'o OpenCuspProposal'];
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
    lines.push('v ' + point.x + ' ' + point.y + ' ' + point.z);
  }
  const triangles = index ? index.length / 3 : position.count / 3;
  for (let i = 0; i < triangles; i++) {
    const a = index ? index[i * 3] + 1 : i * 3 + 1;
    const b = index ? index[i * 3 + 1] + 1 : i * 3 + 2;
    const c = index ? index[i * 3 + 2] + 1 : i * 3 + 3;
    lines.push('f ' + a + ' ' + b + ' ' + c);
  }
  return lines.join('\n') + '\n';
}
async function exportCamHandoff() {
  if (!approvalRecord || !savedDesignHash || !designMesh || designIsStale()) return notify('CAM handoff is blocked until the current proposal has matching approval.', 4500);
  const format = $('cam-format').value;
  const profile = $('cam-machine-profile').value;
  const camVersion = $('cam-version').value.trim();
  const material = $('cam-material').value;
  const blank = $('cam-blank').value.trim();
  const toolProfile = $('cam-tool-profile').value.trim();
  if (!profile || !camVersion || !material || !blank || !toolProfile) return notify('Complete the CAM machine, version, material, blank, and tool profile fields.', 4500);
  const response = await fetch('/api/design/' + encodeURIComponent(caseData.id) + '/cam-handoff', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      format, machineProfile: profile, camVersion, material, blank, toolProfile,
      designFingerprint: savedDesignHash,
      sourceFormats: meshes.map((mesh) => fileExtension(mesh.userData.url)),
      restorationType: currentDesignInputs().designBrief.restorationType
    })
  });
  const result = await response.json();
  if (!response.ok) return notify(result.error || 'CAM handoff was rejected.', 4500);
  const filename = result.manifest.geometry.fileName;
  if (format === 'obj') {
    downloadBlob(new Blob([exportObjText(designMesh)], { type: 'text/plain' }), filename);
  } else {
    const output = new STLExporter().parse(designMesh, { binary: true });
    downloadBlob(new Blob([output], { type: 'model/stl' }), filename);
  }
  downloadBlob(new Blob([JSON.stringify(result.manifest, null, 2)], { type: 'application/json' }), result.manifest.manifestFileName);
  $('cam-handoff-status').textContent = 'Handoff saved locally · operator must import and simulate it in the selected CAM system.';
  notify('CAM handoff exported with approval manifest. No machine was contacted.');
}
function exportReviewStl() {
  if (isBusy || isImporting || isSwitchingCase) return notify('Wait for the current case operation to finish.');
  if (!designMesh) return notify('Generate a crown proposal first.');
  if (designIsStale()) return notify('Proposal inputs changed. Regenerate and save before review export.');
  if (!closureCheck(designMesh.geometry).closed) return notify('Export blocked because mesh closure failed.');
  if (!$('review-confirm').checked) return notify('Confirm the professional review acknowledgement to export.');
  const exporter = new STLExporter();
  const output = exporter.parse(designMesh, { binary: true });
  const blob = new Blob([output], { type: 'model/stl' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = isLegacyTrainingCase() ? 'OpenCusp_TrainingCase3_REVIEW_REQUIRED.stl' : 'OpenCusp_Unassigned_REVIEW_REQUIRED.stl';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  notify('Review STL downloaded. It is not a machine toolpath.');
}
function render() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
function resize() {
  const width = Math.max(1, viewport.clientWidth), height = Math.max(1, viewport.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
function updateRangeLabels() {
  $('clearance-value').textContent = Number($('clearance').value).toFixed(2) + ' mm';
  $('margin-value').textContent = Number($('margin').value).toFixed(1) + ' mm';
  $('wall-value').textContent = Number($('wall').value).toFixed(1) + ' mm';
  const a = Number($('anatomy').value);
  $('anatomy-value').textContent = a < 33 ? 'Smooth' : a > 72 ? 'Pronounced' : 'Balanced';
  refreshDesignFreshness();
}
function collectImportDetails(file, suggestedRole) {
  const dialog = $('import-dialog');
  $('import-file-name').textContent = file.name;
  $('import-role').value = suggestedRole;
  $('import-unit').value = 'mm';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      if (dialog.returnValue !== 'import') return resolve(null);
      resolve({ role: $('import-role').value, sourceUnit: $('import-unit').value });
    }, { once: true });
    dialog.showModal();
  });
}
async function importFiles(files) {
  if (!files.length || isBusy || isImporting || isSwitchingCase) return;
  isImporting = true;
  $('case-picker').disabled = true;
  $('new-case').disabled = true;
  $('import-button').disabled = true;
  $('generate-button').disabled = true;
  $('save-case').disabled = true;
  try {
  if (isBuiltInDemoId()) {
    if (!(await saveCase(true))) return;
    clearCurrentCaseScene();
    caseData = {
      id: 'import-' + crypto.randomUUID().replaceAll('-', '').slice(0, 24),
      title: 'Imported scan case',
      source: 'Local user-provided scans',
      unit: 'mm',
      files: []
    };
    $('case-title').textContent = caseData.title;
    updateMeshList();
    $('clearance').value = '0.06';
    $('margin').value = '4.2';
    $('wall').value = '1';
    $('anatomy').value = '55';
    ['opp-x','opp-y','opp-z','opp-rx','opp-ry','opp-rz'].forEach((id) => { $(id).value = '0'; });
    $('bite-verified').checked = false;
    lastOcclusionGap = null;
    updateRangeLabels();
    updateBiteSummary();
  }
  for (const file of files) {
    const details = await collectImportDetails(file, meshes.some((m) => m.userData.role === 'prep') ? 'scan' : 'prep');
    if (!details) { notify('Scan import cancelled.'); continue; }
    const role = details.role;
    const sourceUnit = details.sourceUnit;
    const unitToMm = ({ mm: 1, cm: 10, in: 25.4 })[sourceUnit];
    if (!unitToMm) { notify('Import cancelled. Choose mm, cm, or in so geometry can be interpreted.'); continue; }
    if (['prep', 'opposing', 'upper', 'preop'].includes(role) && meshes.some((mesh) => mesh.userData.role === role)) {
      notify('This case already has a ' + role + ' scan. Start another case or use a different role.');
      continue;
    }
    try {
      const form = new FormData();
      form.append('role', ['upper', 'opposing', 'prep', 'preop', 'reference', 'scan'].includes(role) ? role : 'scan');
      form.append('mesh', file);
      const response = await fetch('/api/upload', { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Upload failed.');
      const record = { ...result, role: result.role, unit: 'mm', unitToMm, unitProvenance: 'User declared source units as ' + sourceUnit + '; coordinates scaled into millimetres', visible: true, color: roleColors[result.role] || roleColors.scan, opacity: result.role === 'prep' ? 1 : 0.85 };
      await loadMesh(record);
      caseData.files.push(record);
      updateMeshList();
    } catch (error) {
      console.error(error);
      notify('Could not import ' + file.name + ': ' + error.message, 4000);
    }
  }
  clearDesign();
  fitCamera();
  if (getPrepMesh()) fitCamera(getPrepMesh());
  if (!isBuiltInDemoId()) {
    if (await saveCase(true)) await refreshCasePicker();
    else notify('Imported scans remain in this open case. Retry Save before switching or refreshing.', 4200);
  }
  } finally {
    isImporting = false;
    $('case-picker').disabled = false;
    $('new-case').disabled = false;
    $('import-button').disabled = false;
    $('generate-button').disabled = false;
    $('save-case').disabled = false;
  }
}
async function readCase(id) {
  if (isBuiltInDemoId(id)) {
    const response = await fetch('/api/demo');
    if (!response.ok) throw new Error('The training case could not be read.');
    const demo = await response.json();
    if (!isBuiltInDemoId(demo.id)) throw new Error('The configured demo case is invalid.');
    return demo;
  }
  if (!/^[a-z0-9_-]{1,64}$/i.test(id)) throw new Error('The selected saved case id is invalid.');
  const response = await fetch('/api/design/' + encodeURIComponent(id));
  if (!response.ok) throw new Error('The selected saved case could not be reopened. The training case was not substituted.');
  const saved = await response.json();
  if (saved.schemaVersion !== 1 || saved.caseId !== id || !Array.isArray(saved.sources)) throw new Error('The saved case manifest is incomplete or unsupported.');
  const files = saved.sources.map((source) => {
    if (!/^\/user-meshes\/[a-z0-9_-]+\.(stl|ply|obj|off|xyz|pts|csv|pcd)$/i.test(source.url || '') || !/^[a-f0-9]{64}$/i.test(source.sha256 || '')) {
      throw new Error('A saved imported scan has an invalid path or checksum.');
    }
    return source;
  });
  for (const role of ['prep', 'opposing', 'upper', 'preop']) {
    if (files.filter((file) => file.role === role).length > 1) throw new Error('Saved case contains multiple ' + role + ' scans; resolve the duplicate role before reopening.');
  }
  return { id, title: saved.caseTitle || 'Saved scan case', source: 'Local user-provided scans', unit: 'mm', files };
}
async function activateCase(id) {
  const nextCase = await readCase(id);
  clearCurrentCaseScene();
  caseData = nextCase;
  $('case-title').textContent = caseData.title;
  for (const record of caseData.files) await loadMesh(record);
  $('design-source').value = caseData.files.some((record) => record.role === 'reference') ? 'reference' : 'procedural';
  await restoreSavedCase();
  updateMeshList();
  const prep = getPrepMesh();
  if (prep) fitCamera(prep);
  else fitCamera();
  return true;
}
async function refreshCasePicker() {
  const picker = $('case-picker');
  if (!picker) return;
  const options = [{ id: caseData?.id || 'opencusp-public-demo', title: caseData?.title || 'OpenCusp public demo · synthetic mesh' }];
  try {
    const response = await fetch('/api/cases');
    if (response.ok) {
      const payload = await response.json();
      for (const item of payload.cases || []) if (!isBuiltInDemoId(item.id)) options.push(item);
    }
  } catch { /* The training case remains available if listing saved cases fails. */ }
  if (caseData && !options.some((item) => item.id === caseData.id)) options.push({ id: caseData.id, title: caseData.title });
  picker.replaceChildren(...options.map((item) => new Option(item.title, item.id)));
  picker.value = caseData?.id || 'opencusp-public-demo';
}
async function switchCase(id) {
  if (!id || id === caseData?.id) return;
  if (isBusy || isImporting || isSwitchingCase) { $('case-picker').value = caseData?.id || ''; return notify('Wait for the current case operation to finish.'); }
  isSwitchingCase = true;
  $('case-picker').disabled = true;
  $('new-case').disabled = true;
  const previousId = caseData?.id;
  try {
    if (caseData && !(await saveCase())) { $('case-picker').value = previousId; return; }
    await activateCase(id);
    localStorage.setItem('opencusp-active-case-id', id);
    await refreshCasePicker();
    notify('Opened ' + caseData.title + '.');
  } catch (error) {
    console.error(error);
    notify('Could not open that case: ' + error.message, 4500);
    if (previousId) {
      try { await activateCase(previousId); }
      catch (restoreError) { console.error(restoreError); }
    }
    $('case-picker').value = previousId || '';
  } finally {
    isSwitchingCase = false;
    $('case-picker').disabled = false;
    $('new-case').disabled = false;
  }
}
async function createNewCase() {
  if (isBusy || isImporting || isSwitchingCase) return notify('Wait for the current case operation to finish.');
  isSwitchingCase = true;
  $('case-picker').disabled = true;
  $('new-case').disabled = true;
  const previousId = caseData?.id;
  try {
    if (caseData && !(await saveCase())) return;
    clearCurrentCaseScene();
    caseData = { id: 'import-' + crypto.randomUUID().replaceAll('-', '').slice(0, 24), title: 'New scan case', source: 'Local user-provided scans', unit: 'mm', files: [] };
    $('case-title').textContent = caseData.title;
    updateMeshList();
    if (await saveCase()) {
      await refreshCasePicker();
      notify('New case created. Import its preparation and supporting scans.');
    } else if (previousId) {
      try {
        await activateCase(previousId);
        await refreshCasePicker();
      } catch (error) { console.error(error); }
    }
  } finally {
    isSwitchingCase = false;
    $('case-picker').disabled = false;
    $('new-case').disabled = false;
  }
}
async function start() {
  try {
    const activeId = localStorage.getItem('opencusp-active-case-id');
    await activateCase(activeId || 'opencusp-public-demo');
    await refreshCasePicker();
    $('loading').classList.add('hidden');
  } catch (error) {
    console.error(error);
    $('loading').textContent = 'Could not reopen this local case: ' + error.message;
  }
}

function clearCurrentCaseScene() {
  clearDesign();
  for (const mesh of meshes) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  meshes.length = 0;
  isIsolated = false;
  $('bite-verified').checked = false;
  $('clearance').value = '0.06';
  $('margin').value = '4.2';
  $('wall').value = '1';
  $('anatomy').value = '55';
  $('design-source').value = 'procedural';
  $('brief-tooth-id').value = '';
  $('brief-dentition').value = 'permanent';
  $('brief-arch').value = 'maxillary';
  $('brief-restoration-type').value = 'single-crown';
  $('brief-reference').value = 'procedural';
  ['opp-x','opp-y','opp-z','opp-rx','opp-ry','opp-rz'].forEach((id) => { $(id).value = '0'; });
  lastOcclusionGap = null;
  updateRangeLabels();
  updateBiteSummary();
  updateMeshList();
}

function navigateTo(target) {
  const targets = { case: $('case-picker'), design: $('design-brief'), review: $('review-section') };
  if (target === 'settings') {
    $('settings-dialog').showModal();
  } else if (targets[target]) {
    targets[target].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.querySelectorAll('[data-nav-target]').forEach((button) => {
    button.toggleAttribute('aria-current', button.dataset.navTarget === target && target !== 'settings');
  });
}

$('generate-button').addEventListener('click', generateProposal);
$('save-case').addEventListener('click', saveCase);
$('case-picker').addEventListener('change', (event) => switchCase(event.target.value));
$('new-case').addEventListener('click', createNewCase);
$('export-button').addEventListener('click', exportReviewStl);
$('export-button-side').addEventListener('click', exportReviewStl);
$('review-confirm').addEventListener('change', () => {
  refreshDesignFreshness();
  updateApprovalUI();
});
$('clearance').addEventListener('input', updateRangeLabels);
$('margin').addEventListener('input', updateRangeLabels);
$('wall').addEventListener('input', updateRangeLabels);
$('anatomy').addEventListener('input', updateRangeLabels);
$('design-source').addEventListener('change', () => { if (designMesh) refreshDesignFreshness(); updateCaseInputStatus(); });
['opp-x','opp-y','opp-z','opp-rx','opp-ry','opp-rz'].forEach((id) => $(id).addEventListener('input', applyOpposingTransform));
['brief-tooth-id', 'brief-dentition', 'brief-arch', 'brief-restoration-type', 'brief-reference'].forEach((id) => {
  $(id).addEventListener('input', () => { updateCaseInputStatus(); if (designMesh) refreshDesignFreshness(); });
  $(id).addEventListener('change', () => { updateCaseInputStatus(); if (designMesh) refreshDesignFreshness(); });
});
$('bite-verified').addEventListener('change', updateBiteSummary);
$('bite-reset').addEventListener('click', () => { ['opp-x','opp-y','opp-z','opp-rx','opp-ry','opp-rz'].forEach((id) => { $(id).value = '0'; }); $('bite-verified').checked = false; applyOpposingTransform(); });
$('import-button').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (event) => {
  importFiles([...event.target.files]);
  event.target.value = '';
});
$('focus-button').addEventListener('click', () => fitCamera());
$('reset-button').addEventListener('click', () => fitCamera(getPrepMesh() || null));
$('isolate-button').addEventListener('click', () => {
  isIsolated = !isIsolated;
  meshes.forEach((m) => { m.visible = !isIsolated && m.userData.visible !== false; });
  if (isIsolated && getPrepMesh()) getPrepMesh().visible = true;
  if (designMesh) designMesh.visible = true;
  updateMeshList();
  fitCamera(isIsolated ? (designMesh || getPrepMesh()) : null);
});
$('add-restoration').addEventListener('click', () => { navigateTo('design'); $('brief-tooth-id').focus(); notify('Design brief opened.'); });
$('approval-button').addEventListener('click', openApprovalDialog);
$('approval-dialog').addEventListener('close', () => {
  if ($('approval-dialog').returnValue === 'approve') submitApproval().catch((error) => { console.error(error); notify('Approval could not be recorded.', 4500); });
});
$('cam-handoff-button').addEventListener('click', () => exportCamHandoff().catch((error) => { console.error(error); notify('CAM handoff could not be created.', 4500); }));
document.querySelectorAll('[data-nav-target]').forEach((button) => button.addEventListener('click', () => navigateTo(button.dataset.navTarget)));
document.querySelectorAll('.view-tab').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.view-tab').forEach((b) => b.classList.remove('active'));
  button.classList.add('active');
  if (button.dataset.view === 'fit') {
    meshes.forEach((m) => { if (m.userData.role === 'preop') m.visible = false; });
    if (getOpposingMesh()) getOpposingMesh().visible = true;
    if (designMesh) { designMesh.visible = true; designMesh.material.side = THREE.DoubleSide; designMesh.material.clippingPlanes = []; designMesh.material.needsUpdate = true; }
    fitCamera();
    showViewerMessage('Fit & antagonist view · scan registration remains unverified');
    updateMeshList();
  } else if (button.dataset.view === 'intaglio') {
    if (designMesh) {
      const bounds = new THREE.Box3().setFromObject(designMesh);
      const center = bounds.getCenter(new THREE.Vector3());
      // Display-only half section: reveals real Boolean inner faces without changing the STL.
      designMesh.material.side = THREE.DoubleSide;
      designMesh.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -center.x)];
      designMesh.material.needsUpdate = true;
      fitCamera(designMesh, new THREE.Vector3(-1, -0.25, 0.15));
      showViewerMessage('Half-section cutaway · actual Boolean interior · fit is not measured.');
    } else {
      showViewerMessage('Generate a crown to inspect its internal surface.');
    }
  } else if (designMesh) {
    designMesh.material.side = THREE.DoubleSide;
    designMesh.material.clippingPlanes = [];
    designMesh.material.needsUpdate = true;
    showViewerMessage('3D restoration view');
    fitCamera(designMesh);
  }
}));
renderer.domElement.addEventListener('pointermove', (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  const target = meshes.find((m) => m.userData.role === 'prep');
  if (target) {
    const hit = raycaster.intersectObject(target, false)[0];
    if (hit) $('cursor-position').textContent = 'X ' + hit.point.x.toFixed(2) + '  Y ' + hit.point.y.toFixed(2) + '  Z ' + hit.point.z.toFixed(2);
  }
});
window.addEventListener('resize', resize);
updateRangeLabels();
start();
render();
