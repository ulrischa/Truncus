import {definition} from './model.js';

const pages = new Map();

/**
 * A page type describes the document root. Field restrictions apply throughout
 * the tree; requiredLast reserves exactly one position among its direct children.
 */
export class PageType {
  #fieldOptions = new Map();

  constructor({label, requiredLast = null, fieldOptions = {}}) {
    if (typeof label !== 'string' || !label.trim()) throw new Error('A page type needs a label.');
    this.label = label;
    this.requiredLast = requiredLast;
    if (requiredLast !== null) definition(requiredLast);

    for (const [type, fields] of Object.entries(fieldOptions)) {
      const schema = definition(type);
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
    if (this.requiredLast === null) return;
    const matching = blocks.filter(block => block?.type === this.requiredLast);
    if (matching.length !== 1 || blocks.at(-1) !== matching[0]) {
      throw new Error(this.label + ' requires exactly one final ' + this.requiredLast + ' block.');
    }
  }
}

export function registerPageType(key, rules) {
  if (typeof key !== 'string' || !/^[a-z][a-z0-9-]*$/.test(key) || pages.has(key)) {
    throw new Error('Invalid or duplicate page type: ' + key);
  }
  pages.set(key, new PageType(rules));
}

export function pageType(key) {
  const page = pages.get(key);
  if (!page) throw new Error('Unknown page type: ' + key);
  return page;
}

export function pageTypes() {
  return [...pages.keys()];
}

// Version 1 documents have no page type and use the original unrestricted rules.
registerPageType('free', {label: 'Free page'});
