import {pageType} from './page-types.js';
import {createPageBlock, validateDocument} from './model.js';

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

  get page() {
    return pageType(this.#document.pageType ?? 'free');
  }

  canAdd(siblings, type) {
    return siblings !== this.#document.blocks || this.page.layout.canAdd(siblings, type);
  }

  canRemove({siblings, slot}, block) {
    if (siblings.length <= (slot.min ?? 0)) return false;
    return siblings !== this.#document.blocks || this.page.layout.canRemove(siblings, block.type);
  }

  canMove(siblings, index, offset) {
    const neighbor = siblings[index + offset];
    if (!neighbor || !siblings[index]) return false;
    const layout = this.page.layout;
    return siblings !== this.#document.blocks || layout.regionFor(siblings[index].type) === layout.regionFor(neighbor.type);
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
    const index = siblings === this.#document.blocks
      ? this.page.layout.insertionIndex(siblings, type)
      : siblings.length;
    this.#insert(siblings, index, createPageBlock(type, this.page));
  }

  duplicate(siblings, block) {
    this.#insert(siblings, siblings.indexOf(block) + 1, structuredClone(block));
  }

  // A rule can depend on any part of the document. Check the final candidate
  // after every structural operation, restoring the same block objects on failure.
  #changeList(siblings, change) {
    const previous = siblings.slice();
    try {
      change();
      validateDocument(this.#document);
    } catch (error) {
      siblings.splice(0, siblings.length, ...previous);
      throw error;
    }
  }

  #insert(siblings, index, block) {
    this.#changeList(siblings, () => siblings.splice(index, 0, block));
    this.select(block);
  }

  move(siblings, block, offset) {
    const index = siblings.indexOf(block);
    if (!this.canMove(siblings, index, offset)) throw new Error('Cannot move across this boundary.');
    this.#changeList(siblings, () => {
      siblings.splice(index, 1);
      siblings.splice(index + offset, 0, block);
    });
  }

  remove(location, block) {
    if (!this.canRemove(location, block)) throw new Error('This block is required.');
    const {siblings, parent} = location;
    const index = siblings.indexOf(block);
    this.#changeList(siblings, () => siblings.splice(index, 1));
    this.select(siblings[index] ?? siblings[index - 1] ?? parent);
  }
}
