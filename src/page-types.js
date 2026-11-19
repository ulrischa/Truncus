import {defaultCatalog, Catalog} from './registry.js';
import {RootLayout} from './root-layout.js';
import {compileRules, checkRules} from './page-rules.js';



/**
 * A page type describes the document root. Field restrictions apply throughout
 * the tree; root regions govern order and cardinality. Custom rules inspect validated data.
 */
export class PageType {
  #fieldOptions = new Map();

  #rules;

  constructor({label, requiredLast = null, fieldOptions = {}, regions, slots, rules = [], fieldHints = {}}, catalog = defaultCatalog) {
    if (typeof label !== 'string' || !label.trim()) throw new Error('A page type needs a label.');
    this.label = label;
    this.catalog = catalog;
    this.fieldHints = structuredClone(fieldHints);
    this.explicitSlots = slots !== undefined;
    if (slots && (regions || requiredLast)) throw new Error('Choose slots or legacy regions.');
    if (slots !== undefined && (!slots || typeof slots !== 'object' || Array.isArray(slots))) throw new Error('Expected named root slots.');
    this.requiredLast = requiredLast;
    // Translate the original shorthand once. The editor only sees a root layout.
    if (regions !== undefined && requiredLast !== null) throw new Error('Choose regions or requiredLast.');
    const defaultRegions = [{name: 'content'}];
    if (requiredLast !== null) {
      defaultRegions.push({name: 'ending', accept: [requiredLast], min: 1, max: 1, initial: [requiredLast]});
    }
    this.layout = new RootLayout(regions === undefined ? defaultRegions : regions, catalog);
    this.slots = slots ? normalizeSlots(slots, catalog) : this.layout.slots;
    this.#rules = compileRules(rules);

    for (const [type, fields] of Object.entries(fieldOptions)) {
      const schema = catalog.definition(type);
      const restrictions = new Map();
      for (const [key, values] of Object.entries(fields)) {
        const options = schema.fields[key]?.options;
        if (!options || !Array.isArray(values) || !values.length || !values.every(value => options.includes(value))) {
          throw new Error('Expected registered choices for ' + type + '.' + key);
        }
        restrictions.set(key, Object.freeze([...values]));
      }
      this.#fieldOptions.set(type, restrictions);
    }
    Object.freeze(this);
  }

  choices(type, key) {
    return this.#fieldOptions.get(type)?.get(key);
  }

  validateFields(block) {
    for (const [key, options] of this.#fieldOptions.get(block.type) ?? []) {
      if (!options.includes(block.attributes[key])) {
        throw new Error(this.label + ' allows ' + block.type + '.' + key + ' values: ' + options.join(', '));
      }
    }
  }

  validateRoot(blocks) {
    this.layout.validate(blocks);
  }

  validateRules(document, phase, issues, catalog = this.catalog) {
    checkRules(this.#rules, document, phase, issues, this, catalog);
  }
}

function normalizeSlots(slots, catalog) {
  return Object.freeze(Object.fromEntries(Object.entries(slots).map(([key, input]) => {
    const {label = key, min = 0, max = Infinity, initial = [], accept} = input;
    if (!key || !Number.isSafeInteger(min) || min < 0 || (max !== Infinity && !Number.isSafeInteger(max)) ||
        max < min || !Array.isArray(initial) || initial.length < min || initial.length > max ||
        (accept !== undefined && !Array.isArray(accept))) throw new Error('Invalid root slot: ' + key);
    for (const type of accept ?? []) catalog.definition(type);
    for (const type of initial) {
      catalog.definition(type);
      if (accept && !accept.includes(type)) throw new Error('Invalid default in ' + key);
    }
    return [key, Object.freeze({label, min, max, initial: Object.freeze([...initial]),
      accept: accept && Object.freeze([...accept])})];
  })));
}

/** Pass a base catalog to reuse its registrations, or omit it for an empty block catalog. */
export function createCatalog(base) {
  const catalog = new Catalog(base);
  if (!catalog.pages.has('free')) registerPageType('free', {label: 'Free page'}, catalog);
  return catalog;
}

export function registerPageType(key, rules, catalog = defaultCatalog) {
  if (typeof key !== 'string' || !/^[a-z][a-z0-9-]*$/.test(key) || catalog.pages.has(key)) {
    throw new Error('Invalid or duplicate page type: ' + key);
  }
  catalog.pages.set(key, new PageType(rules, catalog));
}

export function pageType(key, catalog = defaultCatalog) {
  const page = catalog.pages.get(key);
  if (!page) throw new Error('Unknown page type: ' + key);
  return page;
}

export function pageTypes(catalog = defaultCatalog) {
  return [...catalog.pages.keys()];
}

// Version 1 documents have no page type and use the original unrestricted rules.
registerPageType('free', {label: 'Free page'});
