import {allowedTypes, definition} from './model.js';
import {element} from './dom.js';
import {renderDocument} from './renderer.js';
import {EditorDocument} from './editor-document.js';

function button(label, action) {
  const control = element('button', label);
  control.type = 'button';
  control.addEventListener('click', action);
  return control;
}

const template = document.createElement('template');
template.innerHTML = `<link rel="stylesheet"><div class="workspace">
  <section class="panel outline"><h2 id="outline-heading">Document outline</h2><div id="tree"></div></section>
  <section class="page"><header><span class="dot"></span> Live preview</header><div id="preview"></div></section>
  <section class="panel inspector"><h2>Block settings</h2><div id="settings"></div></section>
  </div><p role="status" id="feedback"></p>`;
template.content.querySelector('link').href = new URL('./editor.css', import.meta.url).href;

/**
 * Coordinates the document outline, live preview and the selected block's
 * inspector. The model owns mutations; this element owns focus and events.
 */
export class TruncusEditor extends HTMLElement {
  #model = new EditorDocument();
  #locations = new Map();

  constructor() {
    super();
    this.attachShadow({mode: 'open'}).append(template.content.cloneNode(true));
    this.shadowRoot.addEventListener('truncus-edit', event => {
      this.#editField(event.detail);
    });
  }

  connectedCallback() {
    this.#draw();
  }

  /** Read a detached snapshot; assign a saved document to load it. */
  get value() {
    return this.#model.snapshot();
  }

  set value(document) {
    this.#model.load(document);
    this.#draw();
  }

  #editField({key, value}) {
    try {
      if (!this.#model.edit(key, value)) return;
    } catch (error) {
      this.#feedback(error.message + '. This edit was not saved.');
      return;
    }
    // Keep the active input mounted so typing preserves its focus and caret.
    this.#outline();
    this.#preview();
    this.#changed();
  }

  #get(id) {
    return this.shadowRoot.getElementById(id);
  }

  #feedback(message) {
    this.#get('feedback').textContent = message;
  }

  #changed() {
    this.#feedback('');
    this.dispatchEvent(new CustomEvent('truncus-change', {bubbles: true, composed: true}));
  }

  #preview() {
    this.#get('preview').replaceChildren(renderDocument(this.#model.document));
  }

  #draw() {
    this.#outline();
    this.#settings();
    this.#preview();
    this.#feedback('');
  }

  #focusSelection() {
    const target = this.#get('settings').querySelector('h3') ?? this.#get('tree').querySelector('select');
    target?.focus();
  }

  #select(block) {
    this.#model.select(block);
    this.#draw();
    this.#focusSelection();
  }

  /** Publish one change only after a structural command completes successfully. */
  #apply(command) {
    try {
      command();
    } catch (error) {
      this.#feedback(error.message);
      return;
    }
    this.#draw();
    this.#focusSelection();
    this.#changed();
  }

  #picker(slot, siblings) {
    const row = element('div');
    row.className = 'picker';
    const select = element('select');
    select.setAttribute('aria-label', 'Block type for ' + slot.label);
    for (const type of allowedTypes(slot)) {
      if (siblings === this.#model.document.blocks && type === this.#model.page.requiredLast) continue;
      const option = element('option', definition(type).label);
      option.value = type;
      select.append(option);
    }
    row.append(select, button('Add', () => this.#apply(() => this.#model.add(siblings, select.value))));
    return row;
  }

  #outline() {
    this.#locations.clear();
    const rootSlot = {label: 'Document'};
    this.#get('outline-heading').textContent = this.#model.document.pageType
      ? this.#model.page.label + ' · Document outline' : 'Document outline';
    const roots = this.#model.document.blocks;
    this.#get('tree').replaceChildren(
      this.#outlineList(roots, rootSlot, null),
      this.#picker(rootSlot, roots)
    );
  }

  // Index ownership during the traversal we already need for the outline.
  // The root list behaves like a slot whose parent is null.
  #outlineList(siblings, slot, parent) {
    const list = element('ul');
    for (const block of siblings) {
      this.#locations.set(block, {siblings, slot, parent});
      const item = element('li');
      const type = definition(block.type);
      const label = block.attributes.text || block.attributes.summary || type.label;
      const select = button(label, () => this.#select(block));
      select.title = type.label;
      select.setAttribute('aria-pressed', String(block === this.#model.selection));
      item.append(select);

      for (const [name, children] of Object.entries(block.slots)) {
        if (children.length) item.append(this.#outlineList(children, type.slots[name], block));
      }
      list.append(item);
    }
    return list;
  }

  #settings() {
    const panel = this.#get('settings');
    const block = this.#model.selection;
    panel.replaceChildren();
    if (!block) {
      panel.append(element('p', 'Add a block to start writing.'));
      return;
    }
    const type = definition(block.type);
    const heading = element('h3', type.label);
    heading.tabIndex = -1;
    const inspector = element('truncus-block-' + block.type);
    inspector.pageType = this.#model.page;
    inspector.bind(block);
    panel.append(heading, inspector);

    for (const [key, slot] of Object.entries(type.slots)) {
      const children = block.slots[key];
      panel.append(element('h4', slot.label));
      for (const child of children) {
        panel.append(button('Edit ' + definition(child.type).label, () => this.#select(child)));
      }
      if (children.length < (slot.max ?? Infinity)) panel.append(this.#picker(slot, children));
    }
    panel.append(this.#blockActions(block));
  }

  #blockActions(block) {
    const location = this.#locations.get(block);
    const {siblings, slot} = location;
    const index = siblings.indexOf(block);
    const actions = element('div');
    actions.className = 'actions';

    const addAction = (label, enabled, command) => {
      const control = button(label, () => this.#apply(command));
      control.disabled = !enabled;
      actions.append(control);
    };

    const reserved = this.#model.isReserved(siblings, block);
    const nextReserved = this.#model.isReserved(siblings, siblings[index + 1]);
    addAction('Move up', !reserved && index > 0, () => this.#model.move(siblings, block, -1));
    addAction('Move down', !reserved && !nextReserved && index < siblings.length - 1, () => this.#model.move(siblings, block, 1));
    addAction('Duplicate', !reserved && siblings.length < (slot.max ?? Infinity), () => this.#model.duplicate(siblings, block));
    addAction('Remove', !reserved && siblings.length > (slot.min ?? 0), () => this.#model.remove(location, block));
    return actions;
  }
}

customElements.define('truncus-editor', TruncusEditor);
