import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMeshText, validateParsedGeometry } from '../src/mesh-formats.js';

test('parses OBJ polygons and triangulates them', () => {
  const parsed = parseMeshText('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n', '.obj');
  assert.equal(parsed.geometryType, 'surface-mesh');
  assert.equal(validateParsedGeometry(parsed).triangles, 2);
});

test('parses OFF polygons and triangulates them', () => {
  const parsed = parseMeshText('OFF\n4 1 0\n0 0 0\n1 0 0\n1 1 0\n0 1 0\n4 0 1 2 3\n', '.off');
  assert.equal(validateParsedGeometry(parsed).triangles, 2);
});

test('parses XYZ, PTS, CSV, and ASCII PCD point clouds', () => {
  for (const [extension, text] of [
    ['.xyz', '0 0 0\n1 0 0\n0 1 0\n'],
    ['.pts', '3\n0 0 0 1\n1 0 0 1\n0 1 0 1\n'],
    ['.csv', 'x,y,z\n0,0,0\n1,0,0\n0,1,0\n'],
    ['.pcd', 'VERSION .7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH 3\nHEIGHT 1\nPOINTS 3\nDATA ascii\n0 0 0\n1 0 0\n0 1 0\n']
  ]) {
    const parsed = parseMeshText(text, extension);
    assert.equal(parsed.geometryType, 'point-cloud');
    assert.equal(validateParsedGeometry(parsed).vertices, 3);
  }
});

test('rejects non-finite and incomplete geometry', () => {
  assert.throws(() => parseMeshText('v 0 0 0\nv NaN 0 0\nv 0 1 0\nf 1 2 3\n', '.obj'), /non-finite/);
  assert.throws(() => parseMeshText('0 0\n1 0\n0 1\n', '.xyz'), /fewer than three/);
  assert.throws(() => validateParsedGeometry({ geometryType: 'point-cloud', positions: [3.5e38, 0, 0, 0, 1, 0, 0, 0, 1], indices: [] }), /Float32-overflow/);
});

test('maps reordered CSV XYZ columns from a header', () => {
  const parsed = parseMeshText('id,z,x,y\na,0,0,0\nb,0,1,0\nc,0,0,1\n', '.csv');
  assert.deepEqual(parsed.positions, [0, 0, 0, 1, 0, 0, 0, 1, 0]);
  assert.throws(() => parseMeshText('x,y,z\n0,0\n1,0,0\n0,1,0\n', '.csv'), /invalid or incomplete/);
});
