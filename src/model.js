import {rootGroups} from './document-tree.js';
import {defaultCatalog} from './registry.js';
export {definition, blockTypes, register} from './registry.js';
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

const maxBlocks = 5000;
const maxDepth = 64;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
export function createBlock(type, options = {}) {
  const catalog = options?.catalog ?? defaultCatalog;
  return createPageBlock(type, pageType('free', catalog), catalog);
}

/** Apply page defaults recursively, including those of required child blocks. */
export function createPageBlock(type, page, catalog = page.catalog) {
  return buildDefault(type, page, new Set(), {count: 0, catalog});
}

// A recursive slot is fine when it starts empty. A cycle of nonempty defaults
// would never terminate, so reject it before constructing another descendant.
function buildDefault(type, page, ancestors, budget) {
  if (ancestors.has(type)) throw new Error('Cyclic initial block definitions: ' + type);
  if (ancestors.size >= maxDepth || ++budget.count > maxBlocks) throw new Error('Initial block tree exceeds document limits.');
  ancestors.add(type);
  const schema = budget.catalog.definition(type);
  const attributes = Object.fromEntries(Object.entries(schema.fields).map(([key, field]) => {
    const choices = page.choices(type, key);
    const initial = field.initial ?? '';
    return [key, choices && !choices.includes(initial) ? choices[0] : initial];
  }));
  const slots = Object.fromEntries(
    Object.entries(schema.slots).map(([key, slot]) => [key, (slot.initial ?? []).map(child => buildDefault(child, page, ancestors, budget))])
  );
  ancestors.delete(type);
  return {type, ...(schema.version > 1 ? {version: schema.version} : {}), attributes, slots};
}

/** An omitted accept list admits every registered type, including extensions. */
export function allowedTypes(slot, catalog = defaultCatalog) {
  return (slot.accept ?? catalog.types()).filter(type => catalog.has(type) && !slot.exclude?.includes(type));
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

  #catalog;
  #phase;
  #issues;

  constructor(page, catalog, phase, issues) {
    this.#catalog = catalog;
    this.#phase = phase;
    this.#issues = issues;
    this.#page = page;
  }

  visit(block, depth, path) {
    if (depth > maxDepth || this.#visited.size >= maxBlocks) {
      throw new Error('Document exceeds the block or nesting limit.');
    }
    if (!isRecord(block) || !isRecord(block.attributes) || !isRecord(block.slots)) {
      throw new Error('Malformed block.');
    }
    // JSON imports cannot contain cycles, but hosts may also supply live objects.
    if (this.#visited.has(block)) throw new Error('Each block must have exactly one owner.');
    this.#visited.add(block);

    if (typeof block.type !== 'string' || !block.type) throw new Error('Missing block type.');
    if (!this.#catalog.has(block.type)) {
      if (this.#phase === 'publish') {
        const issue = {path, message: 'Load the missing block module: ' + block.type};
        if (!this.#issues) throw new Error(issue.message);
        this.#issues.push(issue);
      }
      return;
    }
    const schema = this.#catalog.definition(block.type);
    if ((block.version ?? 1) !== (schema.version ?? 1)) throw new Error('Block migration required: ' + block.type);
    if (block.marks !== undefined) {
      if (!isRecord(block.marks)) throw new Error('Malformed inline formatting.');
      for (const [key, marks] of Object.entries(block.marks)) {
        if (!schema.fields[key]?.rich || !Array.isArray(marks)) throw new Error('Invalid formatted field.');
        for (const mark of marks) {
          if (!mark || !['strong','em','link'].includes(mark.kind) ||
              !Number.isInteger(mark.start) || !Number.isInteger(mark.end) ||
              mark.start < 0 || mark.end <= mark.start || mark.end > block.attributes[key]?.length ||
              (mark.kind === 'link' && (typeof mark.href !== 'string' || !safeUrl(mark.href)))) {
            throw new Error('Invalid inline formatting range or destination.');
          }
        }
      }
    }
    validateAttributes(block, schema.fields);
    this.#page.validateFields(block);
    validateKeys(block.type, block.slots, schema.slots);
    for (const [key, slot] of Object.entries(schema.slots)) {
      this.visitSlot(block.slots[key], slot, path + '.slots[' + JSON.stringify(key) + ']', depth);
    }
  }

  visitSlot(children, slot, path, parentDepth) {
    if (!Array.isArray(children) || children.length < (slot.min ?? 0) || children.length > (slot.max ?? Infinity)) {
      throw new Error('Invalid number of blocks in ' + path);
    }
    for (const [index, child] of children.entries()) {
      if ((slot.accept && !slot.accept.includes(child?.type)) || slot.exclude?.includes(child?.type)) throw new Error('Invalid child in ' + path);
      this.visit(child, parentDepth + 1, path + '[' + index + ']');
    }
  }
}

/**
 * Validate structure, schema and ownership without modifying the input.
 * @param {TruncusDocument} doc
 * @param {{phase?: 'edit'|'publish'}} [options] Publication also checks completion rules.
 * @returns {TruncusDocument} The original document on success.
 * @throws {Error} When a block or slot violates its schema or page rules.
 */
export function validateDocument(doc, {phase = 'edit', catalog = defaultCatalog, issues} = {}) {
  if (phase !== 'edit' && phase !== 'publish') throw new Error('Unknown validation phase: ' + phase);
  if (!isRecord(doc) || ![1, 2, 3].includes(doc.version) || (doc.version !== 3 && !Array.isArray(doc.blocks))) {
    throw new Error('Expected a version 1, 2 or 3 Truncus document.');
  }
  if (doc.version === 1 && Object.hasOwn(doc, 'pageType')) {
    throw new Error('Typed documents require version 2.');
  }
  const page = pageType(doc.version === 1 ? 'free' : doc.pageType, catalog);
  const validator = new DocumentValidator(page, catalog, phase, issues);
  if (doc.version === 3) {
    if (!isRecord(doc.root) || doc.root.type !== doc.pageType || !isRecord(doc.root.slots) ||
        !isRecord(doc.root.attributes) || Object.keys(doc.root.attributes).length || Object.hasOwn(doc, 'blocks')) {
      throw new Error('Invalid page root.');
    }
    validateKeys(doc.pageType, doc.root.slots, page.slots);
    for (const {items, slot, path} of rootGroups(doc, page)) validator.visitSlot(items, slot, path, 0);
  } else {
    if (page.explicitSlots) throw new Error('This page type requires named root slots.');
    page.validateRoot(doc.blocks);
    doc.blocks.forEach((block, index) => validator.visit(block, 1, '$.blocks[' + index + ']'));
  }
  page.validateRules(doc, phase, issues, catalog);
  return doc;
}

/** Create a typed document with its required root content already present. */
export function createDocument(key = 'free', {catalog = defaultCatalog, namedSlots = false} = {}) {
  const page = pageType(key, catalog);
  const budget = {count: 0, catalog};
  if (page.explicitSlots || namedSlots) {
    const slots = Object.fromEntries(Object.entries(page.slots).map(([name, slot]) =>
      [name, slot.initial.map(type => buildDefault(type, page, new Set(), budget))]));
    return validateDocument({version: 3, pageType: key, root: {type: key, attributes: {}, slots}}, {catalog});
  }
  const blocks = page.layout.initialTypes().map(type => buildDefault(type, page, new Set(), budget));
  return validateDocument({version: 2, pageType: key, blocks}, {catalog});
}
