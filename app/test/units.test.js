import test from 'node:test';
import assert from 'node:assert/strict';
import { unitToMillimeters } from '../src/units.js';

test('converts only explicitly supported scan units to millimeters', () => {
  assert.equal(unitToMillimeters('mm'), 1);
  assert.equal(unitToMillimeters('cm'), 10);
  assert.equal(unitToMillimeters('in'), 25.4);
});

test('rejects missing or unknown scan units instead of assuming millimeters', () => {
  for (const unit of [undefined, '', 'um', 'inch', 'MM']) {
    assert.throws(() => unitToMillimeters(unit), /explicit source unit/);
  }
});
