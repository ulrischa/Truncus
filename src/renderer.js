import {definition, validateDocument} from './model.js';
import {element} from './dom.js';

/** Render descendants first so each block receives ready-to-insert child nodes by slot. */
function renderBlock(block) {
  const renderedSlots = Object.fromEntries(
    Object.entries(block.slots).map(([key, children]) => [key, children.map(renderBlock)])
  );
  const component = definition(block.type);
  return component.render(block.attributes, renderedSlots, element);
}

/** Render a valid document into a fresh fragment for preview or publication. */
export function renderDocument(doc, options) {
  validateDocument(doc, options);
  return renderValidatedDocument(doc);
}

/** Internal editor path: mutations and imports have already validated this tree. */
export function renderValidatedDocument(doc) {
  const fragment = document.createDocumentFragment();
  for (const block of doc.blocks) fragment.append(renderBlock(block));
  return fragment;
}

/** Serialize published content without the editor's controls or shadow roots. */
export function serializeHTML(doc) {
  const container = element('div');
  container.append(renderDocument(doc, {phase: 'publish'}));
  return container.innerHTML;
}
