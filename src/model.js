// Each named slot owns an ordered collection of child blocks.
const types = new Map();
const namePattern = /^[a-z][a-z0-9-]*$/;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const blockTypes = () => [...types.keys()];

export function definition(type) {
  const entry = types.get(type);
  if (!entry) throw new Error('Unknown block type: ' + type);
  return entry;
}

export function register(type, component) {
  if (!namePattern.test(type) || types.has(type)) throw new Error('Invalid or duplicate block: ' + type);
  customElements.define('truncus-block-' + type, component);
  types.set(type, component);
}

export function safeUrl(value) {
  if (!value.trim()) return '';
  try {
    const url = new URL(value, 'https://example.invalid/');
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ? value : '';
  } catch {
    return '';
  }
}

export function createBlock(type) {
  const {fields, slots} = definition(type);
  const attributes = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.initial ?? '']));
  const children = Object.fromEntries(Object.entries(slots).map(([key, slot]) =>
    [key, (slot.initial ?? []).map(createBlock)]));
  return {type, attributes, slots: children};
}

export function allowedTypes(slot) {
  return slot.accept ?? blockTypes();
}

export function validateDocument(doc) {
  if (!isRecord(doc) || doc.version !== 1 || !Array.isArray(doc.blocks)) throw new Error('Expected a version 1 Truncus document.');
  let count = 0;
  const seen = new Set();
  function visit(node, depth) {
    if (++count > 5000 || depth > 64) throw new Error('Document exceeds the block or nesting limit.');
    if (!isRecord(node) || !isRecord(node.attributes) || !isRecord(node.slots)) throw new Error('Malformed block.');
    if (seen.has(node)) throw new Error('Each block must have exactly one owner.');
    seen.add(node);
    const {fields, slots} = definition(node.type);
    for (const [values, schema] of [[node.attributes, fields], [node.slots, slots]]) {
      if (Object.keys(values).length !== Object.keys(schema).length ||
          Object.keys(values).some(key => !Object.hasOwn(schema, key))) throw new Error('Unexpected or missing fields in ' + node.type);
    }
    for (const [key, field] of Object.entries(fields)) {
      const value = node.attributes[key];
      if (typeof value !== 'string' || (field.options && !field.options.includes(value)) ||
          (field.kind === 'url' && value && !safeUrl(value))) throw new Error('Invalid ' + field.label + ' in ' + node.type);
    }
    for (const [key, slot] of Object.entries(slots)) {
      const items = node.slots[key];
      if (!Array.isArray(items) || items.length < (slot.min ?? 0) || items.length > (slot.max ?? Infinity))
        throw new Error('Invalid number of blocks in ' + node.type + '.' + key);
      for (const child of items) {
        if (!allowedTypes(slot).includes(child?.type)) throw new Error('Invalid child in ' + node.type + '.' + key);
        visit(child, depth + 1);
      }
    }
  }
  doc.blocks.forEach(node => visit(node, 1));
  return doc;
}
