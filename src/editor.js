import {allowedTypes, createBlock, definition, validateDocument} from './model.js';
import {element, renderDocument} from './component.js';

function button(label, action) {
  const control = element('button', label);
  control.type = 'button';
  control.addEventListener('click', action);
  return control;
}

const template = document.createElement('template');
template.innerHTML = `<link rel="stylesheet"><div class="workspace">
  <section class="panel outline"><h2>Document outline</h2><div id="tree"></div></section>
  <section class="page"><header><span class="dot"></span> Live preview</header><div id="preview"></div></section>
  <section class="panel inspector"><h2>Block settings</h2><div id="settings"></div></section>
  </div><p role="status" id="feedback"></p>`;
template.content.querySelector('link').href = new URL('./editor.css', import.meta.url).href;

export class TruncusEditor extends HTMLElement {
  #doc = {version: 1, blocks: []};
  #selected = null;
  #locations = new Map();

  constructor() {
    super();
    this.attachShadow({mode: 'open'}).append(template.content.cloneNode(true));
    this.shadowRoot.addEventListener('truncus-edit', event => {
      const {key, value} = event.detail;
      const block = this.#selected;
      if (!block || !Object.hasOwn(block.attributes, key)) return;
      const previous = block.attributes[key];
      block.attributes[key] = value;
      try { validateDocument(this.#doc); }
      catch (error) {
        block.attributes[key] = previous;
        this.#feedback(error.message + '. This edit was not saved.');
        return;
      }
      this.#outline();
      this.#preview();
      this.#changed();
    });
  }

  connectedCallback() { this.#draw(); }
  get value() { return structuredClone(this.#doc); }
  set value(doc) {
    const copy = structuredClone(doc);
    this.#doc = validateDocument(copy);
    this.#selected = copy.blocks[0] ?? null;
    this.#draw();
  }

  #get(id) { return this.shadowRoot.getElementById(id); }
  #feedback(message) { this.#get('feedback').textContent = message; }
  #changed() {
    this.#feedback('');
    this.dispatchEvent(new CustomEvent('truncus-change', {bubbles: true, composed: true}));
  }
  #preview() {
    this.#get('preview').replaceChildren(renderDocument(this.#doc));
  }
  #draw() {
    this.#outline();
    this.#settings();
    this.#preview();
    this.#feedback('');
  }
  #select(block) {
    this.#selected = block;
    this.#draw();
    this.#get('settings').querySelector('h3')?.focus();
  }
  #picker(slot, list) {
    const row = element('div');
    row.className = 'picker';
    const select = element('select');
    select.setAttribute('aria-label', 'Block type for ' + slot.label);
    for (const type of allowedTypes(slot)) {
      const option = element('option', definition(type).label);
      option.value = type;
      select.append(option);
    }
    row.append(select, button('Add', () => {
      const block = createBlock(select.value);
      list.push(block);
      try { validateDocument(this.#doc); }
      catch (error) { list.pop(); this.#feedback(error.message); return; }
      this.#select(block);
      this.#changed();
    }));
    return row;
  }

  #outline() {
    this.#locations.clear();
    const build = (list, slot, parent) => {
      const ul = element('ul');
      for (const block of list) {
        this.#locations.set(block, {list, slot, parent});
        const li = element('li');
        const type = definition(block.type);
        const title = block.attributes.text || block.attributes.summary;
        const pick = button(title || type.label, () => this.#select(block));
        pick.title = type.label;
        pick.setAttribute('aria-pressed', String(block === this.#selected));
        li.append(pick);
        for (const [name, nested] of Object.entries(block.slots)) {
          if (nested.length) li.append(build(nested, type.slots[name], block));
        }
        ul.append(li);
      }
      return ul;
    };
    const root = {label: 'Document'};
    this.#get('tree').replaceChildren(build(this.#doc.blocks, root, null), this.#picker(root, this.#doc.blocks));
  }

  #settings() {
    const panel = this.#get('settings');
    const block = this.#selected;
    panel.replaceChildren();
    if (!block) { panel.append(element('p', 'Add a block to start writing.')); return; }
    const type = definition(block.type);
    const heading = element('h3', type.label);
    heading.tabIndex = -1;
    const editor = element('truncus-block-' + block.type);
    editor.bind(block);
    panel.append(heading, editor);
    for (const [key, slot] of Object.entries(type.slots)) {
      const items = block.slots[key];
      panel.append(element('h4', slot.label));
      for (const child of items) panel.append(button('Edit ' + definition(child.type).label, () => this.#select(child)));
      if (items.length < (slot.max ?? Infinity)) panel.append(this.#picker(slot, items));
    }
    const {list, slot, parent} = this.#locations.get(block);
    const i = list.indexOf(block);
    const actions = element('div');
    actions.className = 'actions';
    for (const [label, offset] of [['Move up', -1], ['Move down', 1]]) {
      const control = button(label, () => {
        [list[i], list[i + offset]] = [list[i + offset], block];
        this.#select(block);
        this.#changed();
      });
      control.disabled = !list[i + offset];
      actions.append(control);
    }
    const duplicate = button('Duplicate', () => {
      const copy = structuredClone(block);
      list.splice(i + 1, 0, copy);
      try { validateDocument(this.#doc); }
      catch (error) { list.splice(i + 1, 1); this.#feedback(error.message); return; }
      this.#select(copy);
      this.#changed();
    });
    duplicate.disabled = list.length >= (slot.max ?? Infinity);
    actions.append(duplicate);
    const remove = button('Remove', () => {
      list.splice(i, 1);
      this.#select(list[i] ?? list[i - 1] ?? parent);
      this.#changed();
    });
    remove.disabled = list.length <= (slot.min ?? 0);
    actions.append(remove);
    panel.append(actions);
  }
}
customElements.define('truncus-editor', TruncusEditor);
