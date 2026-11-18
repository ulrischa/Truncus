import {definition} from './registry.js';

/**
 * Ordered regions partition the root sequence by type without adding wrappers to
 * stored JSON or HTML. One optional catch-all region accepts unassigned types.
 */
export class RootLayout {
  #regions = [];
  #owners = new Map();
  #fallback;

  constructor(regions) {
    if (!Array.isArray(regions)) throw new Error('Expected an ordered array of root regions.');
    const names = new Set();
    for (const {name, accept, min = 0, max = Infinity, initial = []} of regions) {
      if (typeof name !== 'string' || !name.trim() || names.has(name)) {
        throw new Error('Each root region needs a unique name.');
      }
      names.add(name);
      if (!Number.isSafeInteger(min) || min < 0 || (max !== Infinity && !Number.isSafeInteger(max)) || max < min) {
        throw new Error('Invalid bounds for region ' + name);
      }
      if (!Array.isArray(initial) || initial.length < min || initial.length > max) {
        throw new Error('Initial content must satisfy the bounds for region ' + name);
      }
      const region = Object.freeze({name, index: this.#regions.length, min, max, initial: Object.freeze([...initial])});
      this.#regions.push(region);
      if (accept === undefined) {
        if (this.#fallback) throw new Error('Only one root region can accept unassigned types.');
        this.#fallback = region;
      } else {
        if (!Array.isArray(accept)) throw new Error('Expected a list of accepted types for ' + name);
        for (const type of accept) {
          definition(type);
          if (this.#owners.has(type)) throw new Error('Root type belongs to multiple regions: ' + type);
          this.#owners.set(type, region);
        }
      }
    }
    // Resolve catch-all defaults only after every explicit owner is known.
    for (const region of this.#regions) {
      for (const type of region.initial) {
        definition(type);
        if (this.regionFor(type) !== region) throw new Error('Invalid initial type in region ' + region.name);
      }
    }
  }

  regionFor(type) {
    return this.#owners.get(type) ?? this.#fallback;
  }

  initialTypes() {
    return this.#regions.flatMap(region => region.initial);
  }

  count(blocks, region) {
    return blocks.reduce((total, block) => total + Number(this.regionFor(block.type) === region), 0);
  }

  canAdd(blocks, type) {
    const region = this.regionFor(type);
    return Boolean(region && (region.max === Infinity || this.count(blocks, region) < region.max));
  }

  canRemove(blocks, type) {
    const region = this.regionFor(type);
    return region.min === 0 || this.count(blocks, region) > region.min;
  }

  /** Append to the matching region, before the first child of a later region. */
  insertionIndex(blocks, type) {
    const region = this.regionFor(type);
    if (!region) throw new Error('Root block type is not allowed: ' + type);
    const next = blocks.findIndex(block => this.regionFor(block.type).index > region.index);
    return next < 0 ? blocks.length : next;
  }

  validate(blocks) {
    const counts = Array(this.#regions.length).fill(0);
    let previous = -1;
    for (const block of blocks) {
      const region = this.regionFor(block?.type);
      if (!region) throw new Error('Root block type is not allowed: ' + block?.type);
      if (region.index < previous) throw new Error('Root block is out of order in region ' + region.name);
      previous = region.index;
      counts[region.index]++;
    }
    for (const {name, index, min, max} of this.#regions) {
      if (counts[index] < min || counts[index] > max) throw new Error('Invalid block count in region ' + name);
    }
  }
}
