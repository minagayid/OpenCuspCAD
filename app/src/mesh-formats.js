const finite = (value) => Number.isFinite(value);
const FLOAT32_MAX = 3.4028234663852886e38;

export const SURFACE_EXTENSIONS = Object.freeze(['.stl', '.ply', '.obj', '.off']);
export const POINT_CLOUD_EXTENSIONS = Object.freeze(['.xyz', '.pts', '.csv', '.pcd']);
export const ACCEPTED_EXTENSIONS = Object.freeze([...SURFACE_EXTENSIONS, ...POINT_CLOUD_EXTENSIONS]);

function cleanLines(text) {
  return String(text).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

function resolveObjIndex(value, vertexCount) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric === 0) throw new Error('OBJ face contains an invalid vertex index.');
  const index = numeric > 0 ? numeric - 1 : vertexCount + numeric;
  if (index < 0 || index >= vertexCount) throw new Error('OBJ face references a missing vertex.');
  return index;
}

export function parseObjText(text) {
  const positions = [];
  const indices = [];
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const fields = trimmed.split(/\s+/);
    if (fields[0] === 'v') {
      if (fields.length < 4) throw new Error('OBJ vertex is missing a coordinate.');
      const values = fields.slice(1, 4).map(Number);
      if (!values.every(finite)) throw new Error('OBJ contains a non-finite vertex coordinate.');
      positions.push(...values);
    } else if (fields[0] === 'f') {
      if (fields.length < 4) throw new Error('OBJ face has fewer than three vertices.');
      const face = fields.slice(1).map((field) => resolveObjIndex(field.split('/')[0], positions.length / 3));
      for (let i = 1; i < face.length - 1; i++) indices.push(face[0], face[i], face[i + 1]);
    }
  }
  if (positions.length < 9) throw new Error('OBJ contains fewer than three vertices.');
  return { geometryType: indices.length ? 'surface-mesh' : 'point-cloud', positions, indices };
}

export function parseOffText(text) {
  const lines = cleanLines(text);
  if (lines[0]?.toUpperCase() !== 'OFF') throw new Error('OFF file must begin with OFF.');
  const counts = lines[1]?.split(/\s+/).map(Number) || [];
  if (counts.length < 2 || !Number.isInteger(counts[0]) || !Number.isInteger(counts[1]) || counts[0] < 3 || counts[1] < 1) {
    throw new Error('OFF header is missing valid vertex and face counts.');
  }
  const vertexCount = counts[0];
  const faceCount = counts[1];
  const positions = [];
  for (let i = 0; i < vertexCount; i++) {
    const values = lines[2 + i]?.split(/\s+/).slice(0, 3).map(Number) || [];
    if (values.length < 3 || !values.every(finite)) throw new Error('OFF contains an invalid vertex.');
    positions.push(...values);
  }
  const indices = [];
  for (let i = 0; i < faceCount; i++) {
    const fields = lines[2 + vertexCount + i]?.split(/\s+/).map(Number) || [];
    const size = fields[0];
    if (!Number.isInteger(size) || size < 3 || fields.length < size + 1) throw new Error('OFF contains an invalid face.');
    const face = fields.slice(1, size + 1);
    if (!face.every((index) => Number.isInteger(index) && index >= 0 && index < vertexCount)) throw new Error('OFF face references a missing vertex.');
    for (let j = 1; j < face.length - 1; j++) indices.push(face[0], face[j], face[j + 1]);
  }
  return { geometryType: 'surface-mesh', positions, indices };
}

function pointFromFields(fields, indexes = [0, 1, 2]) {
  if (fields.length <= Math.max(...indexes)) return null;
  const values = indexes.map((index) => Number(fields[index]));
  return values.every(finite) ? values : null;
}

export function parsePointCloudText(text, extension = '.xyz') {
  const rawLines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let lines = rawLines.filter((line) => !line.startsWith('#'));
  if (extension === '.pcd') {
    const dataIndex = lines.findIndex((line) => /^data\s+ascii$/i.test(line));
    if (dataIndex < 0) throw new Error('Only ASCII PCD point clouds are supported.');
    const fieldsLine = lines.find((line) => /^fields\s+/i.test(line));
    const fields = fieldsLine ? fieldsLine.split(/\s+/).slice(1).map((field) => field.toLowerCase()) : ['x', 'y', 'z'];
    const x = fields.indexOf('x'), y = fields.indexOf('y'), z = fields.indexOf('z');
    if ([x, y, z].some((index) => index < 0)) throw new Error('PCD must declare x, y, and z fields.');
    const positions = [];
    for (const line of lines.slice(dataIndex + 1)) {
      const values = line.split(/\s+/).map(Number);
      if (values.length <= Math.max(x, y, z)) continue;
      const point = [values[x], values[y], values[z]];
      if (!point.every(finite)) throw new Error('PCD contains a non-finite point.');
      positions.push(...point);
    }
    if (positions.length < 9) throw new Error('Point cloud contains fewer than three points.');
    return { geometryType: 'point-cloud', positions, indices: [] };
  }
  if (extension === '.pts' && lines[0] && /^\d+$/.test(lines[0])) lines = lines.slice(1);
  let indexes = [0, 1, 2];
  if (extension === '.csv' && lines[0]) {
    const header = lines[0].split(/[\s,;]+/).map((field) => field.toLowerCase());
    const named = ['x', 'y', 'z'].map((name) => header.indexOf(name));
    if (named.every((index) => index >= 0)) {
      indexes = named;
      lines = lines.slice(1);
    }
  }
  const positions = [];
  for (const line of lines) {
    const point = pointFromFields(line.split(/[\s,;]+/), indexes);
    if (extension === '.csv' && !point) throw new Error('CSV contains an invalid or incomplete XYZ row.');
    if (point) positions.push(...point);
  }
  if (positions.length < 9) throw new Error('Point cloud contains fewer than three numeric XYZ points.');
  return { geometryType: 'point-cloud', positions, indices: [] };
}

export function parseMeshText(text, extension) {
  const ext = String(extension).toLowerCase();
  if (ext === '.obj') return parseObjText(text);
  if (ext === '.off') return parseOffText(text);
  if (POINT_CLOUD_EXTENSIONS.includes(ext)) return parsePointCloudText(text, ext);
  throw new Error('No text parser is registered for ' + ext + '.');
}

export function validateParsedGeometry(parsed, maxPoints = 5_000_000, maxTriangles = 1_000_000, unitToMm = 1) {
  if (!finite(unitToMm) || unitToMm <= 0) throw new Error('Source unit scale must be a positive finite number.');
  if (!parsed || !Array.isArray(parsed.positions) || parsed.positions.length % 3 !== 0) throw new Error('Geometry coordinates are incomplete.');
  const vertices = parsed.positions.length / 3;
  if (vertices < 3 || vertices > maxPoints) throw new Error('Geometry must contain between 3 and ' + maxPoints.toLocaleString() + ' vertices.');
  if (!parsed.positions.every((value) => finite(value) && Math.abs(value * unitToMm) <= FLOAT32_MAX)) throw new Error('Geometry contains a non-finite or Float32-overflow coordinate after unit scaling.');
  const triangles = parsed.indices.length / 3;
  if (!Number.isInteger(triangles) || (triangles < 1 && parsed.geometryType === 'surface-mesh')) throw new Error('Surface mesh contains no complete triangles.');
  if (triangles > maxTriangles) throw new Error('Mesh exceeds the local preview limit of ' + maxTriangles.toLocaleString() + ' triangles.');
  return { geometryType: parsed.geometryType, vertices, triangles };
}
