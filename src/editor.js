import {allowedTypes, validateDocument} from './model.js';
import {element} from './dom.js';
import {Canvas} from './canvas.js';
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
  <section class="page"><header><span class="dot"></span> Document canvas</header><div id="preview"></div></section>
  <section class="panel inspector"><h2>Block settings</h2><div id="settings"></div></section>
  </div><div id="history"></div><div id="issues"></div><p role="status" id="feedback"></p>`;
template.content.querySelector('link').href = new URL('./editor.css', import.meta.url).href;

/**
 * Coordinates the document outline, live preview and the selected block's
 * inspector. The model owns mutations; this element owns focus and events.
 */
export class TruncusEditor extends HTMLElement {
  #model = new EditorDocument();
  #locations = new Map();
  #paths = new Map();
  #canvas;

  get catalog() { return this.#model.catalog; }

  set catalog(value) {
    const next = new EditorDocument(value);
    next.load(this.value);
    this.#model = next;
    this.#setupCanvas();
    this.#draw();
  }

  #setupCanvas() {
    this.#canvas = new Canvas(this.#model, {
      selected: () => { this.#outline(); this.#settings(); },
      field: change => {
        try {
          if (change()) { this.#outline(); this.#settings(); this.#changed(); }
          return true;
        } catch (error) { this.#feedback(error.message); return false; }
      },
      command: (fn, focus) => this.#apply(fn, focus),
      feedback: message => this.#feedback(message),
      siblings: block => this.#locations.get(block).siblings,
      focusField: (block, key) => this.#focusField(block, key),
      picker: (slot, items) => this.#picker(slot, items)
    });
  }

  constructor() {
    super();
    this.attachShadow({mode: 'open'}).append(template.content.cloneNode(true));
    this.#setupCanvas();
    this.shadowRoot.addEventListener('keydown', event => {
      if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      event.preventDefault();
      if (key === 'y' || event.shiftKey) this.redo(); else this.undo();
    });
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
    this.#history();
    this.#get('issues').replaceChildren();
    this.#feedback('');
    this.dispatchEvent(new CustomEvent('truncus-change', {bubbles: true, composed: true}));
  }

  #preview() {
    this.#canvas.close();
    this.#canvas.render(this.#get('preview'));
  }

  #draw() {
    this.#outline();
    this.#settings();
    this.#preview();
    this.#history();
    this.#get('issues').replaceChildren();
    this.#feedback('');
  }

  undo() { if (this.#model.canUndo) this.#apply(() => this.#model.undo()); }
  redo() { if (this.#model.canRedo) this.#apply(() => this.#model.redo()); }

  #history() {
    const undo = button('Undo', () => this.undo());
    const redo = button('Redo', () => this.redo());
    undo.disabled = !this.#model.canUndo;
    redo.disabled = !this.#model.canRedo;
    this.#get('history').replaceChildren(undo, redo, button('Check publication', () => this.checkPublication()));
  }

  #focusField(block, key) {
    this.#model.select(block);
    this.#outline();
    this.#settings();
    const inspector = this.#get('settings').querySelector('[data-inspector]');
    const field = [...(inspector?.shadowRoot?.querySelectorAll('[data-field]') ?? [])]
      .find(input => input.dataset.field === key);
    (field ?? this.#get('settings').querySelector('h3'))?.focus();
  }

  /** Return every publication diagnostic and offer navigation or an explicit field repair. */
  checkPublication() {
    const issues = [];
    try { validateDocument(this.#model.document, {catalog: this.catalog, phase: 'publish', issues}); }
    catch (error) { issues.push({message: error.message, path: '$'}); }
    const panel = this.#get('issues');
    panel.replaceChildren();
    for (const issue of issues) {
      const row = element('div');
      const block = this.#paths.get(issue.path);
      row.append(block ? button(issue.message, () => this.#focusField(block, issue.field)) : element('p', issue.message));
      if (block && issue.fix && typeof issue.fix.value === 'string' && Object.hasOwn(block.attributes, issue.field)) {
        row.append(button(issue.fix.label ?? 'Apply correction', () => {
          this.#apply(() => this.#model.edit(issue.field, issue.fix.value, block));
          this.checkPublication();
        }));
      }
      panel.append(row);
    }
    this.#feedback(issues.length ? issues.length + ' publication issues.' : 'Ready to publish.');
    return issues;
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
  #apply(command, focusCanvas = false) {
    try {
      command();
    } catch (error) {
      this.#feedback(error.message);
      return;
    }
    this.#draw();
    if (!focusCanvas || !this.#canvas.focus(this.#model.selection)) this.#focusSelection();
    this.#changed();
    return true;
  }

  #picker(slot, siblings) {
    const row = element('div');
    row.className = 'picker';
    const select = element('select');
    select.setAttribute('aria-label', 'Block type for ' + slot.label);
    for (const type of allowedTypes(slot, this.catalog)) {
      if (!this.#model.canAdd(siblings, type)) continue;
      const option = element('option', this.catalog.definition(type).label);
      option.value = type;
      select.append(option);
    }
    const add = button('Add', () => this.#apply(() => this.#model.add(siblings, select.value)));
    select.disabled = add.disabled = !select.options.length || siblings.length >= (slot.max ?? Infinity);
    row.append(select, add);
    return row;
  }

  #outline() {
    this.#locations.clear();
    this.#paths.clear();
    this.#get('outline-heading').textContent = this.#model.document.pageType
      ? this.#model.page.label + ' · Document outline' : 'Document outline';
    const tree = this.#get('tree');
    tree.replaceChildren();
    for (const {name, slot, items, path} of this.#model.groups) {
      if (name) tree.append(element('h4', slot.label));
      tree.append(this.#outlineList(items, slot, null, path), this.#picker(slot, items));
    }
  }

  // Index ownership during the traversal we already need for the outline.
  // The root list behaves like a slot whose parent is null.
  #outlineList(siblings, slot, parent, path) {
    const list = element('ul');
    for (const [index, block] of siblings.entries()) {
      const here = path + '[' + index + ']';
      this.#paths.set(here, block);
      this.#locations.set(block, {siblings, slot, parent});
      const item = element('li');
      const type = this.catalog.has(block.type) ? this.catalog.definition(block.type) : null;
      const label = type ? block.attributes.text || block.attributes.summary || type.label : 'Missing module: ' + block.type;
      const select = button(label, () => this.#select(block));
      select.title = type?.label ?? block.type;
      select.setAttribute('aria-pressed', String(block === this.#model.selection));
      item.append(select);

      for (const [name, children] of Object.entries(type ? block.slots : {})) {
        if (children.length) item.append(this.#outlineList(children, type.slots[name], block, here + '.slots[' + JSON.stringify(name) + ']'));
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
    const type = this.catalog.has(block.type) ? this.catalog.definition(block.type) : null;
    if (!type) {
      panel.append(element('h3', 'Missing module: ' + block.type), element('p', 'The original block is retained in JSON.'));
      panel.append(this.#blockActions(block));
      return;
    }
    const heading = element('h3', type.label);
    heading.tabIndex = -1;
    const inspector = element(this.catalog.tag(block.type));
    inspector.dataset.inspector = '';
    // Inspectors receive effective field choices, without having to interpret page rules.
    inspector.fieldChoices = Object.fromEntries(Object.keys(type.fields).map(key =>
      [key, this.#model.page.choices(block.type, key) ?? type.fields[key].options]
    ));
    // Preserve the original inspector property for existing third-party extensions.
    inspector.pageType = this.#model.page;
    inspector.bind(block);
    panel.append(heading, inspector);

    for (const [key, slot] of Object.entries(type.slots)) {
      const children = block.slots[key];
      panel.append(element('h4', slot.label));
      for (const child of children) {
        panel.append(button('Edit ' + (this.catalog.has(child.type) ? this.catalog.definition(child.type).label : child.type), () => this.#select(child)));
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

    for (const [label, offset] of [['Move up', -1], ['Move down', 1]]) {
      addAction(label, this.#model.canMove(siblings, index, offset), () => this.#model.move(siblings, block, offset));
    }
    const canDuplicate = siblings.length < (slot.max ?? Infinity) && this.#model.canAdd(siblings, block.type);
    addAction('Duplicate', canDuplicate, () => this.#model.duplicate(siblings, block));
    addAction('Remove', this.#model.canRemove(location, block), () => this.#model.remove(location, block));
    if (['paragraph','heading'].includes(block.type)) {
      const target = block.type === 'paragraph' ? 'heading' : 'paragraph';
      if (allowedTypes(slot, this.catalog).includes(target) && this.#model.canAdd(siblings, target)) {
        addAction('Convert to ' + target, true, () => this.#model.transform(siblings, block, target));
      }
    }
    if (block.type === 'link' && allowedTypes(slot, this.catalog).includes('link-list')) {
      addAction('Group adjacent links', true, () => this.#model.groupLinks(siblings, block));
    }
    if (this.#model.document.version === 3 && !location.parent) {
      for (const {slot: destination, items} of this.#model.groups) {
        if (items === siblings || !allowedTypes(destination, this.catalog).includes(block.type)) continue;
        const enabled = this.#model.canRemove(location, block) && items.length < (destination.max ?? Infinity);
        addAction('Move to ' + destination.label, enabled, () => this.#model.moveToSlot(siblings, items, block));
      }
    }
    return actions;
  }
}

customElements.define('truncus-editor', TruncusEditor);
