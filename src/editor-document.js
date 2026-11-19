import {pageType} from './page-types.js';
import {createPageBlock, validateDocument} from './model.js';
import {defaultCatalog} from './registry.js';
import {prepareDocument} from './migrations.js';
import {rootGroups} from './document-tree.js';
import {editedMarks, sliceMarks} from './marks.js';

/** Commands retain only the affected fields or sibling range and their inverse. */
export class EditorDocument {
  #document = {version: 1, blocks: []};
  #selection = null;
  #past = [];
  #future = [];
  constructor(catalog = defaultCatalog) { this.catalog = catalog; }
  get document() { return this.#document; }
  get page() { return pageType(this.#document.pageType ?? 'free', this.catalog); }
  get groups() { return rootGroups(this.#document, this.page); }
  get selection() { return this.#selection; }
  get canUndo() { return Boolean(this.#past.length); }
  get canRedo() { return Boolean(this.#future.length); }
  select(block) { this.#selection = block; }
  snapshot() { return structuredClone(this.#document); }
  create(type) { return createPageBlock(type, this.page, this.catalog); }

  load(source) {
    const candidate = prepareDocument(source, {catalog: this.catalog});
    this.#document = candidate;
    this.#selection = this.groups.flatMap(group => group.items)[0] ?? null;
    this.#past = [];
    this.#future = [];
  }

  canAdd(siblings, type) {
    return siblings !== this.document.blocks || this.page.layout.canAdd(siblings, type);
  }
  canRemove({siblings, slot}, block) {
    return siblings.length > (slot.min ?? 0) &&
      (siblings !== this.document.blocks || this.page.layout.canRemove(siblings, block.type));
  }
  canMove(siblings, index, offset) {
    const other = siblings[index + offset];
    if (!other || !siblings[index]) return false;
    return siblings !== this.document.blocks ||
      this.page.layout.regionFor(siblings[index].type) === this.page.layout.regionFor(other.type);
  }

  #commit(name, forward, backward, selected, group) {
    const previous = this.selection;
    forward();
    try { validateDocument(this.document, {catalog: this.catalog}); }
    catch (error) { backward(); throw error; }
    this.select(selected);
    const last = this.#past.at(-1);
    if (group && last?.group === group && !this.#future.length) last.forward = forward;
    else this.#past.push({name, forward, backward, previous, selected, group});
    if (this.#past.length > 100) this.#past.shift();
    this.#future = [];
  }

  undo() {
    const entry = this.#past.pop();
    if (!entry) return;
    entry.backward();
    this.select(entry.previous);
    this.#future.push(entry);
  }
  redo() {
    const entry = this.#future.pop();
    if (!entry) return;
    entry.forward();
    this.select(entry.selected);
    this.#past.push(entry);
  }

  edit(key, value, block = this.selection, formatting, group) {
    if (!block || !Object.hasOwn(block.attributes, key)) return false;
    const before = block.attributes[key];
    const oldMarks = block.marks;
    if (before === value && formatting === undefined) return false;
    const ranges = formatting ?? (oldMarks?.[key] && editedMarks(oldMarks[key], before, value));
    const nextMarks = ranges ? {...oldMarks, [key]: ranges} : oldMarks;
    const write = (text, marks) => {
      block.attributes[key] = text;
      if (marks) block.marks = marks;
      else delete block.marks;
    };
    this.#commit('setField', () => write(value, nextMarks), () => write(before, oldMarks), block, group);
    return true;
  }

  replace(name, siblings, start, count, blocks, selected = blocks[0] ?? null) {
    const removed = siblings.slice(start, start + count);
    this.#commit(name, () => siblings.splice(start, count, ...blocks),
      () => siblings.splice(start, blocks.length, ...removed), selected);
  }
  add(siblings, type) {
    const index = siblings === this.document.blocks ? this.page.layout.insertionIndex(siblings, type) : siblings.length;
    this.replace('insertBlock', siblings, index, 0, [this.create(type)]);
  }
  duplicate(siblings, block) {
    this.replace('duplicateBlock', siblings, siblings.indexOf(block) + 1, 0, [structuredClone(block)]);
  }
  move(siblings, block, offset) {
    const index = siblings.indexOf(block);
    if (!this.canMove(siblings, index, offset)) throw new Error('Cannot move across this boundary.');
    const start = Math.min(index, index + offset);
    this.replace('moveBlock', siblings, start, 2, siblings.slice(start, start + 2).reverse(), block);
  }
  remove(location, block) {
    if (!this.canRemove(location, block)) throw new Error('This block is required.');
    const {siblings, parent} = location;
    const index = siblings.indexOf(block);
    this.replace('removeBlock', siblings, index, 1, [], siblings[index+1] ?? siblings[index-1] ?? parent);
  }

  moveToSlot(siblings, destination, block) {
    const index = siblings.indexOf(block);
    this.#commit('moveToSlot', () => {
      siblings.splice(index, 1);
      destination.push(block);
    }, () => {
      destination.pop();
      siblings.splice(index, 0, block);
    }, block);
  }

  transform(siblings, block, type) {
    const next = this.create(type);
    next.attributes.text = block.attributes.text;
    if (block.marks) next.marks = structuredClone(block.marks);
    this.replace('transformBlock', siblings, siblings.indexOf(block), 1, [next]);
  }

  groupLinks(siblings, block) {
    let start = siblings.indexOf(block), end = start + 1;
    while (siblings[start-1]?.type === 'link') start--;
    while (siblings[end]?.type === 'link') end++;
    const list = this.create('link-list');
    list.slots.links[0].slots.items = siblings.slice(start, end);
    this.replace('groupLinks', siblings, start, end-start, [list]);
  }

  /** Preserve both sides of the selection when inserting a paragraph break or rich paste. */
  insertAtSelection(siblings, block, key, start, end, inserted, split = false) {
    const text = block.attributes[key];
    const marks = block.marks?.[key];
    const part = (original, from, to) => {
      const next = structuredClone(original);
      next.attributes[key] = text.slice(from, to);
      if (marks) next.marks = {...next.marks, [key]: sliceMarks(marks, from, to)};
      return next;
    };
    const before = part(block, 0, start);
    const after = part(split ? this.create('paragraph') : block, end, text.length);
    const replacement = [];
    if (split || start) replacement.push(before);
    replacement.push(...inserted);
    if (split || end < text.length) replacement.push(after);
    this.replace(split ? 'splitParagraph' : 'pasteBlocks', siblings, siblings.indexOf(block), 1,
      replacement, split ? after : inserted.at(-1));
  }
}
