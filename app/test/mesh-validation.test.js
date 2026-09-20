import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { inspectClosedMesh } from '../src/mesh-validation.js';

const tetraFaces = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]];
const tetraPoints = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
function triangleSoup(faces = tetraFaces, points = tetraPoints) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(faces.flatMap((face) => face.flatMap((index) => points[index])), 3));
  return geometry;
}

test('accepts one consistently wound closed solid with positive volume', () => {
  const geometry = triangleSoup();
  const result = inspectClosedMesh(geometry);
  geometry.dispose();
  assert.equal(result.closed, true);
  assert.equal(result.components, 1);
  assert.ok(result.signedVolumeMm3 > 0);
});

test('rejects open boundaries and non-manifold edges', () => {
  const open = triangleSoup(tetraFaces.slice(1));
  const openResult = inspectClosedMesh(open);
  open.dispose();
  assert.equal(openResult.closed, false);
  assert.ok(openResult.open > 0);

  const nonManifold = triangleSoup([...tetraFaces, tetraFaces[0]]);
  const nonManifoldResult = inspectClosedMesh(nonManifold);
  nonManifold.dispose();
  assert.equal(nonManifoldResult.closed, false);
  assert.ok(nonManifoldResult.nonManifold > 0);
});

test('rejects disconnected solids, reversed orientation, and degenerate faces', () => {
  const second = tetraPoints.map(([x, y, z]) => [x + 3, y, z]);
  const secondFaces = tetraFaces.map((face) => face.map((index) => index + tetraPoints.length));
  const disconnected = triangleSoup([...tetraFaces, ...secondFaces], [...tetraPoints, ...second]);
  const disconnectedResult = inspectClosedMesh(disconnected);
  disconnected.dispose();
  assert.equal(disconnectedResult.closed, false);
  assert.equal(disconnectedResult.components, 2);

  const reversed = triangleSoup(tetraFaces.map(([a, b, c]) => [a, c, b]));
  const reversedResult = inspectClosedMesh(reversed);
  reversed.dispose();
  assert.equal(reversedResult.closed, false);
  assert.ok(reversedResult.signedVolumeMm3 < 0);

  const flippedFace = triangleSoup([...tetraFaces.slice(0, 3), [1, 3, 2]]);
  const flippedResult = inspectClosedMesh(flippedFace);
  flippedFace.dispose();
  assert.equal(flippedResult.closed, false);
  assert.ok(flippedResult.inconsistentWinding > 0);

  const degenerate = triangleSoup([...tetraFaces, [0, 0, 1]]);
  const degenerateResult = inspectClosedMesh(degenerate);
  degenerate.dispose();
  assert.equal(degenerateResult.closed, false);
  assert.ok(degenerateResult.degenerate > 0);
});

test('rejects non-finite coordinates', () => {
  const geometry = triangleSoup();
  geometry.attributes.position.array[0] = Number.NaN;
  const result = inspectClosedMesh(geometry);
  geometry.dispose();
  assert.equal(result.closed, false);
  assert.equal(result.invalid, 1);
});
