import {createBlock, validateDocument} from './model.js';

/**
 * Owns one editor's working tree and selection. Blocks retain object identity
 * during edits, so moving a block also preserves its selected descendants.
 * Instances are internal; hosts exchange plain versioned JSON via editor.value.
 */
export class EditorDocument {
  #document = {version: 1, blocks: []};
  #selection = null;

  /** Internal read access for the outline and renderer. Use snapshot() for callers. */
  get document() {
    return this.#document;
  }

  get selection() {
    return this.#selection;
  }

  select(block) {
    this.#selection = block;
  }

  snapshot() {
    return structuredClone(this.#document);
  }

  /** Validate a detached candidate first so a failed import preserves the draft. */
  load(document) {
    const candidate = structuredClone(document);
    validateDocument(candidate);
    this.#document = candidate;
    this.select(candidate.blocks[0] ?? null);
  }

  /** Validate the proposed value before notifying views or persistence listeners. */
  edit(key, value) {
    const attributes = this.#selection?.attributes;
    if (!attributes || !Object.hasOwn(attributes, key)) return false;

    const previous = attributes[key];
    attributes[key] = value;
    try {
      validateDocument(this.#document);
    } catch (error) {
      attributes[key] = previous;
      throw error;
    }
    return true;
  }

  add(siblings, type) {
    this.#insert(siblings, siblings.length, createBlock(type));
  }

  duplicate(siblings, block) {
    this.#insert(siblings, siblings.indexOf(block) + 1, structuredClone(block));
  }

  // Validate the entire tree: even a locally permitted child can exceed the
  // document's depth or size limit. A failed insertion keeps the old selection.
  #insert(siblings, index, block) {
    siblings.splice(index, 0, block);
    try {
      validateDocument(this.#document);
    } catch (error) {
      siblings.splice(index, 1);
      throw error;
    }
    this.select(block);
  }

  /** Reordering within the same slot preserves its type and cardinality rules. */
  move(siblings, block, offset) {
    const index = siblings.indexOf(block);
    const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= siblings.length) return;
    siblings.splice(index, 1);
    siblings.splice(destination, 0, block);
  }

  /** Keep selection close to the removed block, including in a newly empty slot. */
  remove({siblings, slot, parent}, block) {
    if (siblings.length <= (slot.min ?? 0)) return;
    const index = siblings.indexOf(block);
    siblings.splice(index, 1);
    this.select(siblings[index] ?? siblings[index - 1] ?? parent);
  }
}
