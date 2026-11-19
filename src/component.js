import {element} from './dom.js';

// Preserve direct module imports used by existing extensions.
export {element} from './dom.js';
export {renderDocument, serializeHTML} from './renderer.js';

function createFieldControl(field, options) {
  if (options) {
    const select = element('select');
    for (const choice of options) select.append(element('option', choice));
    return select;
  }
  return element(field.kind === 'multiline' ? 'textarea' : 'input');
}

const inspector = document.createElement('template');
inspector.innerHTML = `<style>
  :host{display:block}label{display:grid;gap:.4rem;margin:.9rem 0;font-weight:600}
  input,textarea,select{box-sizing:border-box;width:100%;font:inherit;color:inherit;border:1px solid #adb6aa;border-radius:.4rem;padding:.65rem;background:white}
  textarea{min-height:6rem;resize:vertical}
</style><slot name="before-fields"></slot><div></div><slot name="after-fields"></slot>`;

/**
 * Base inspector for registered block types. Subclasses declare their schema
 * and implement static render(attributes, renderedSlots, element).
 * An instance exists for the selected block only; JSON stores its data.
 */
export class TruncusBlock extends HTMLElement {
  static fields = {};
  static slots = {};

  constructor() {
    super();
    this.attachShadow({mode: 'open'}).append(inspector.content.cloneNode(true));
  }

  /** Bind a working block. Custom inspectors should request edits via setAttributeValue(). */
  bind(block) {
    this.block = block;
    const container = this.shadowRoot.querySelector('div');
    container.replaceChildren();
    for (const [key, field] of Object.entries(this.constructor.fields)) {
      const label = element('label', field.label);
      const choices = this.fieldChoices?.[key] ?? field.options;
      const input = createFieldControl(field, choices);
      input.dataset.field = key;
      input.value = block.attributes[key];
      input.addEventListener('input', event => {
        if (!event.isComposing) this.setAttributeValue(key, input.value);
      });
      input.addEventListener('compositionend', () => this.setAttributeValue(key, input.value));
      label.append(input);
      const hint = this.pageType?.fieldHints?.[block.type]?.[key];
      if (hint) label.append(element('small', hint));
      container.append(label);
    }
  }

  /** Send an edit request across shadow boundaries for validation by the owning editor. */
  setAttributeValue(key, value) {
    this.dispatchEvent(new CustomEvent('truncus-edit', {detail: {key, value}, bubbles: true, composed: true}));
  }
}
