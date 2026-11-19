import {defaultCatalog} from './registry.js';
import {pageType} from './page-types.js';
import {rootGroups} from './document-tree.js';
import {validateDocument} from './model.js';

/** Migrate a detached tree. Unknown blocks remain opaque until their module returns. */
export function prepareDocument(source, {catalog = defaultCatalog, upgradeRoot = false} = {}) {
  const doc = structuredClone(source);
  const page = pageType(doc.pageType ?? 'free', catalog);
  const seen = new Set();
  function upgrade(block, depth) {
    if (!block || typeof block !== 'object' || Array.isArray(block) || seen.has(block) || depth > 64 || seen.size >= 5000) throw new Error('Invalid block tree.');
    seen.add(block);
    if (!catalog.has(block.type)) return block;
    const schema = catalog.definition(block.type);
    const latest = schema.version ?? 1;
    if (!Number.isSafeInteger(latest) || latest < 1) throw new Error('Invalid block schema version.');
    let version = block.version ?? 1;
    if (!Number.isSafeInteger(version) || version < 1 || version > latest) throw new Error('Unsupported block version: ' + block.type);
    while (version < latest) {
      const migrate = schema.migrations?.[version];
      if (typeof migrate !== 'function') throw new Error('Missing migration for ' + block.type + ' version ' + version);
      const type = block.type;
      block = migrate(block);
      if (block?.type !== type) throw new Error('Migration must preserve the block type.');
      block.version = ++version;
    }
    for (const children of Object.values(block.slots ?? {})) {
      if (!Array.isArray(children)) throw new Error('Invalid child slot.');
      children.forEach((child, index) => { children[index] = upgrade(child, depth + 1); });
    }
    return block;
  }
  for (const {items} of rootGroups(doc, page)) {
    if (!Array.isArray(items)) throw new Error('Expected a block collection.');
    items.forEach((block, index) => { items[index] = upgrade(block, 1); });
  }
  validateDocument(doc, {catalog});
  if (!upgradeRoot || doc.version === 3) return doc;
  const slots = Object.fromEntries(Object.keys(page.slots).map(key => [key, []]));
  for (const block of doc.blocks) {
    const name = page.layout.regionFor(block.type)?.name;
    if (!Object.hasOwn(slots, name)) throw new Error('Cannot infer the root slot for ' + block.type);
    slots[name].push(block);
  }
  const {blocks, ...metadata} = doc;
  return validateDocument({...metadata, version: 3, pageType: doc.pageType ?? 'free',
    root: {type: doc.pageType ?? 'free', attributes: {}, slots}}, {catalog});
}
