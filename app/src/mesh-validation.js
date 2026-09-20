import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const WELD_TOLERANCE_MM = 0.00008;

/** Engineering mesh checks only: this does not test anatomy, fit, or milling suitability. */
export function inspectClosedMesh(geometry) {
  const source = geometry?.attributes?.position;
  if (!source || source.count < 3 || source.count % 3 !== 0 && !geometry.index) {
    return { closed: false, edges: 0, open: 0, nonManifold: 0, components: 0, degenerate: 0, invalid: 1, inconsistentWinding: 0, signedVolumeMm3: 0 };
  }

  for (let i = 0; i < source.array.length; i++) {
    if (!Number.isFinite(source.array[i])) {
      return { closed: false, edges: 0, open: 0, nonManifold: 0, components: 0, degenerate: 0, invalid: 1, inconsistentWinding: 0, signedVolumeMm3: 0 };
    }
  }

  const positionOnly = geometry.clone();
  for (const key of Object.keys(positionOnly.attributes)) {
    if (key !== 'position') positionOnly.deleteAttribute(key);
  }
  const welded = mergeVertices(positionOnly, WELD_TOLERANCE_MM);
  positionOnly.dispose();
  const idx = welded.index;
  if (!idx || idx.count < 3 || idx.count % 3 !== 0) {
    welded.dispose();
    return { closed: false, edges: 0, open: 0, nonManifold: 0, components: 0, degenerate: 0, invalid: 1, inconsistentWinding: 0, signedVolumeMm3: 0 };
  }

  const edgeUses = new Map();
  const parent = Array.from({ length: welded.attributes.position.count }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const p = welded.attributes.position;
  let degenerate = 0;
  let signedVolumeMm3 = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const cross = new THREE.Vector3();

  for (let i = 0; i < idx.count; i += 3) {
    const tri = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
    if (new Set(tri).size !== 3) { degenerate++; continue; }
    a.fromBufferAttribute(p, tri[0]);
    b.fromBufferAttribute(p, tri[1]);
    c.fromBufferAttribute(p, tri[2]);
    if (cross.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).lengthSq() <= 1e-18) degenerate++;
    signedVolumeMm3 += a.dot(cross.crossVectors(b, c)) / 6;
    join(tri[0], tri[1]); join(tri[1], tri[2]);
    for (let e = 0; e < 3; e++) {
      const from = tri[e], to = tri[(e + 1) % 3];
      const key = from < to ? from + ':' + to : to + ':' + from;
      const use = edgeUses.get(key) || [];
      use.push(from < to ? 1 : -1);
      edgeUses.set(key, use);
    }
  }

  let open = 0, nonManifold = 0, inconsistentWinding = 0;
  for (const uses of edgeUses.values()) {
    if (uses.length === 1) open++;
    else if (uses.length !== 2) nonManifold++;
    else if (uses[0] === uses[1]) inconsistentWinding++;
  }
  const roots = new Set();
  for (let i = 0; i < parent.length; i++) roots.add(find(i));
  const components = roots.size;
  const closed = open === 0 && nonManifold === 0 && inconsistentWinding === 0 && degenerate === 0 && components === 1 && signedVolumeMm3 > 1e-9;
  const result = { closed, edges: edgeUses.size, open, nonManifold, components, degenerate, invalid: 0, inconsistentWinding, signedVolumeMm3 };
  welded.dispose();
  return result;
}
