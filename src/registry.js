let serial = 0;

/** A catalog owns storage keys. Browser tag names stay unique across independent catalogs. */
export class Catalog {
  #blocks;
  #tags;
  #prefix;
  pages;

  constructor(base) {
    this.#blocks = new Map(base?.#blocks);
    this.#tags = new Map(base?.#tags);
    this.pages = new Map(base?.pages);
    this.#prefix = serial++ === 0 ? 'truncus-block-' : 'truncus-local-' + serial + '-';
  }

  has(type) { return this.#blocks.has(type); }
  types() { return [...this.#blocks.keys()]; }
  tag(type) { return this.#tags.get(type); }

  definition(type) {
    if (!this.has(type)) throw new Error('Unknown block type: ' + type);
    return this.#blocks.get(type);
  }

  register(type, component) {
    if (typeof type !== 'string' || !/^[a-z][a-z0-9-]*$/.test(type) || this.has(type)) {
      throw new Error('Invalid or duplicate block: ' + type);
    }
    if (!Number.isSafeInteger(component.version ?? 1) || (component.version ?? 1) < 1) {
      throw new Error('Block version must be a positive integer: ' + type);
    }
    const tag = this.#prefix + type;
    // An autonomous custom element constructor can only be registered once.
    customElements.define(tag, this === defaultCatalog ? component : class extends component {});
    this.#tags.set(type, tag);
    this.#blocks.set(type, component);
  }
}

export const defaultCatalog = new Catalog();
export const definition = type => defaultCatalog.definition(type);
export const blockTypes = () => defaultCatalog.types();
export const register = (type, component) => defaultCatalog.register(type, component);
