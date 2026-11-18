import {pageType} from './page-types.js';

/**
 * @typedef {object} Block
 * @property {string} type Stable registry key stored in JSON.
 * @property {Record<string, string>} attributes Values described by the block's fields.
 * @property {Record<string, Block[]>} slots Ordered children grouped by relationship.
 *
 * @typedef {object} TruncusDocument
 * @property {1|2} version Version 2 records the page type.
 * @property {string} [pageType] Registered type key, required for version 2.
 * @property {Block[]} blocks Top-level blocks in reading order.
 */

const types = new Map();
const namePattern = /^[a-z][a-z0-9-]*$/;
const maxBlocks = 5000;
const maxDepth = 64;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Return registered type keys in insertion order, as shown in block pickers. */
export function blockTypes() {
  return [...types.keys()];
}

/** Resolve the class that defines a type's schema, inspector and HTML renderer. */
export function definition(type) {
  const component = types.get(type);
  if (!component) throw new Error('Unknown block type: ' + type);
  return component;
}

/** Register a stable storage key and its associated browser custom element. */
export function register(type, component) {
  if (!namePattern.test(type) || types.has(type)) {
    throw new Error('Invalid or duplicate block: ' + type);
  }
  customElements.define('truncus-block-' + type, component);
  types.set(type, component);
}

/** Check the resolved scheme while preserving relative URLs in published HTML. */
export function safeUrl(value) {
  if (!value.trim()) return '';
  try {
    const url = new URL(value, 'https://example.invalid/');
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ? value : '';
  } catch {
    return '';
  }
}

/** Create an independent block tree from registered defaults. @returns {Block} */
export function createBlock(type) {
  return createPageBlock(type, pageType('free'));
}

/** Apply page defaults recursively, including those of required child blocks. */
export function createPageBlock(type, page) {
  const schema = definition(type);
  const attributes = Object.fromEntries(Object.entries(schema.fields).map(([key, field]) => {
    const choices = page.choices(type, key);
    const initial = field.initial ?? '';
    return [key, choices && !choices.includes(initial) ? choices[0] : initial];
  }));
  const slots = Object.fromEntries(
    Object.entries(schema.slots).map(([key, slot]) => [key, (slot.initial ?? []).map(child => createPageBlock(child, page))])
  );
  return {type, attributes, slots};
}

/** An omitted accept list admits every registered type, including extensions. */
export function allowedTypes(slot) {
  return slot.accept ?? blockTypes();
}

function validateKeys(type, values, schema) {
  const keys = Object.keys(values);
  if (keys.length !== Object.keys(schema).length || keys.some(key => !Object.hasOwn(schema, key))) {
    throw new Error('Unexpected or missing fields in ' + type);
  }
}

function validateAttributes(block, fields) {
  validateKeys(block.type, block.attributes, fields);
  for (const [key, field] of Object.entries(fields)) {
    const value = block.attributes[key];
    const invalid = () => new Error('Invalid ' + field.label + ' in ' + block.type);
    if (typeof value !== 'string') throw invalid();
    if (field.options && !field.options.includes(value)) throw invalid();
    if (field.kind === 'url' && value && !safeUrl(value)) throw invalid();
  }
}

/** A fresh traversal owns its visited set so separate validation calls are independent. */
class DocumentValidator {
  #visited = new Set();
  #page;

  constructor(page) {
    this.#page = page;
  }

  visit(block, depth) {
    if (depth > maxDepth || this.#visited.size >= maxBlocks) {
      throw new Error('Document exceeds the block or nesting limit.');
    }
    if (!isRecord(block) || !isRecord(block.attributes) || !isRecord(block.slots)) {
      throw new Error('Malformed block.');
    }
    // JSON imports cannot contain cycles, but hosts may also supply live objects.
    if (this.#visited.has(block)) throw new Error('Each block must have exactly one owner.');
    this.#visited.add(block);

    const schema = definition(block.type);
    validateAttributes(block, schema.fields);
    this.#page.validateFields(block);
    validateKeys(block.type, block.slots, schema.slots);
    for (const [key, slot] of Object.entries(schema.slots)) {
      this.#visitSlot(block.slots[key], slot, block.type + '.' + key, depth);
    }
  }

  #visitSlot(children, slot, path, parentDepth) {
    if (!Array.isArray(children) || children.length < (slot.min ?? 0) || children.length > (slot.max ?? Infinity)) {
      throw new Error('Invalid number of blocks in ' + path);
    }
    const permitted = allowedTypes(slot);
    for (const child of children) {
      if (!permitted.includes(child?.type)) throw new Error('Invalid child in ' + path);
      this.visit(child, parentDepth + 1);
    }
  }
}

/**
 * Validate structure, schema and ownership without modifying the input.
 * @param {TruncusDocument} doc
 * @returns {TruncusDocument} The original document on success.
 * @throws {Error} When a block or slot violates its schema or page rules.
 */
export function validateDocument(doc) {
  if (!isRecord(doc) || ![1, 2].includes(doc.version) || !Array.isArray(doc.blocks)) {
    throw new Error('Expected a version 1 or 2 Truncus document.');
  }
  if (doc.version === 1 && Object.hasOwn(doc, 'pageType')) {
    throw new Error('Typed documents require version 2.');
  }
  const page = pageType(doc.version === 1 ? 'free' : doc.pageType);
  page.validateRoot(doc.blocks);
  const validator = new DocumentValidator(page);
  for (const block of doc.blocks) validator.visit(block, 1);
  return doc;
}

/** Create a typed document with its required root content already present. */
export function createDocument(key = 'free') {
  const page = pageType(key);
  const blocks = page.requiredLast ? [createPageBlock(page.requiredLast, page)] : [];
  return validateDocument({version: 2, pageType: key, blocks});
}
