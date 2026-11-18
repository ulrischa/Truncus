import {definition, validateDocument} from './model.js';

export function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

const inspector = document.createElement('template');
inspector.innerHTML = `<style>
  :host{display:block}label{display:grid;gap:.4rem;margin:.9rem 0;font-weight:600}
  input,textarea,select{box-sizing:border-box;width:100%;font:inherit;color:inherit;border:1px solid #adb6aa;border-radius:.4rem;padding:.65rem;background:white}
  textarea{min-height:6rem;resize:vertical}
</style><slot name="before-fields"></slot><div></div><slot name="after-fields"></slot>`;

export class TruncusBlock extends HTMLElement {
  static fields = {};
  static slots = {};

  constructor() {
    super();
    this.attachShadow({mode: 'open'}).append(inspector.content.cloneNode(true));
  }

  bind(block) {
    this.block = block;
    const container = this.shadowRoot.querySelector('div');
    container.replaceChildren();
    for (const [key, field] of Object.entries(this.constructor.fields)) {
      const label = element('label', field.label);
      const input = element(field.options ? 'select' : field.kind === 'multiline' ? 'textarea' : 'input');
      if (field.options) for (const choice of field.options) input.append(element('option', choice));
      input.value = block.attributes[key];
      input.addEventListener('input', () => this.setAttributeValue(key, input.value));
      label.append(input);
      container.append(label);
    }
  }

  setAttributeValue(key, value) {
    this.dispatchEvent(new CustomEvent('truncus-edit', {detail: {key, value}, bubbles: true, composed: true}));
  }
}

export function renderDocument(doc) {
  validateDocument(doc);
  function render(node) {
    const slots = Object.fromEntries(Object.entries(node.slots).map(([key, items]) => [key, items.map(render)]));
    return definition(node.type).render(node.attributes, slots, element);
  }
  const fragment = document.createDocumentFragment();
  fragment.append(...doc.blocks.map(render));
  return fragment;
}

export function serializeHTML(doc) {
  const container = element('div');
  container.append(renderDocument(doc));
  return container.innerHTML;
}
