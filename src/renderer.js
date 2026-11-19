import {validateDocument} from './model.js';
import {defaultCatalog} from './registry.js';
import {pageType} from './page-types.js';
import {rootGroups} from './document-tree.js';
import {element} from './dom.js';
import {renderMarks} from './marks.js';

/** The optional decorator runs only in the editing canvas, after public markup exists. */
export function renderBlock(block, catalog, decorate) {
  if (!catalog.has(block.type)) return element('p', 'Missing module: ' + block.type);
  const schema = catalog.definition(block.type);
  const slots = Object.fromEntries(Object.entries(block.slots).map(([key, children]) =>
    [key, children.map(child => renderBlock(child, catalog, decorate))]));
  const node = schema.render(block.attributes, slots, element);
  const targets = {};
  for (const [key, field] of Object.entries(schema.fields)) {
    if (!field.inline) continue;
    const target = field.inline === true ? node : node.querySelector(field.inline);
    if (!target) continue;
    targets[key] = target;
    renderMarks(target, block.attributes[key], block.marks?.[key], element);
  }
  return decorate?.(block, node, targets) ?? node;
}

export function renderDocument(doc, options = {}) {
  validateDocument(doc, options);
  const catalog = options.catalog ?? defaultCatalog;
  const fragment = document.createDocumentFragment();
  for (const {items} of rootGroups(doc, pageType(doc.pageType ?? 'free', catalog))) {
    for (const block of items) fragment.append(renderBlock(block, catalog));
  }
  return fragment;
}

export function serializeHTML(doc, options = {}) {
  const container = element('div');
  container.append(renderDocument(doc, {...options, phase: 'publish', issues: undefined}));
  return container.innerHTML;
}
