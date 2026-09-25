const UNIT_TO_MM = Object.freeze({ mm: 1, cm: 10, in: 25.4 });

export function unitToMillimeters(sourceUnit) {
  if (typeof sourceUnit !== 'string' || !Object.hasOwn(UNIT_TO_MM, sourceUnit)) {
    throw new Error('Select an explicit source unit: mm, cm, or in.');
  }
  return UNIT_TO_MM[sourceUnit];
}
