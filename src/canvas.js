import {renderBlock} from './renderer.js';
import {element} from './dom.js';
import {clipboardBlocks} from './clipboard.js';
import {renderMarks, sliceMarks} from './marks.js';

function action(label, handler) {
  const button = element('button', label);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
}

/** The canvas decorates the published DOM; active fields use native text controls for IME and selection. */
export class Canvas {
  constructor(model, host) {
    this.model = model;
    this.host = host;
    this.targets = new Map();
  }

  render(container) {
    this.targets.clear();
    container.replaceChildren();
    for (const {items, slot, name} of this.model.groups) {
      const section = element('section');
      if (name) section.append(element('h3', slot.label ?? name));
      for (const block of items) {
        section.append(renderBlock(block, this.model.catalog, (child, node, targets) =>
          this.decorate(child, node, targets)));
      }
      if (name || !items.length) section.append(this.host.picker(slot, items));
      container.append(section);
    }
  }

  decorate(block, node, targets) {
    const schema = this.model.catalog.definition(block.type);
    for (const [key, target] of Object.entries(targets)) {
      const activate = () => this.open(block, key, target);
      const button = action('', activate);
      button.className = 'edit-text';
      button.setAttribute('aria-label', 'Edit ' + schema.fields[key].label);
      button.append(...target.childNodes);
      if (!button.textContent) button.textContent = schema.fields[key].label;
      // Inline marks may contain anchors. In edit mode their text remains selectable.
      for (const anchor of button.querySelectorAll('a')) anchor.removeAttribute('href');
      if (target.matches?.('a')) target.removeAttribute('href');
      target.append(button);
      if (!this.targets.has(block)) this.targets.set(block, new Map());
      this.targets.get(block).set(key, {target, activate});
    }
    const controls = [];
    for (const [key, slot] of Object.entries(schema.slots)) {
      if (slot.action && slot.accept?.length === 1 && block.slots[key].length < (slot.max ?? Infinity)) {
        controls.push(action(slot.action, () => this.host.command(() => this.model.add(block.slots[key], slot.accept[0]), true)));
      }
    }
    for (const [key, field] of Object.entries(schema.fields)) {
      if (field.kind === 'url') controls.push(action(field.label, () => this.host.focusField(block, key)));
    }
    if (node.matches?.('details')) node.open = true;
    if (!controls.length) return node;
    const wrapper = element('div');
    wrapper.className = 'canvas-group';
    wrapper.append(node, ...controls);
    return wrapper;
  }

  focus(block, key) {
    const fields = this.targets.get(block);
    const entry = key ? fields?.get(key) : fields?.values().next().value;
    entry?.activate();
    return Boolean(entry);
  }

  open(block, key, target) {
    if (this.active && this.active !== target) this.close();
    if (target.querySelector('.canvas-input')) return;
    this.active = target;
    this.model.select(block);
    this.host.selected();
    const field = this.model.catalog.definition(block.type).fields[key];
    const input = element('textarea');
    input.className = 'canvas-input';
    input.rows = field.kind === 'multiline' ? 3 : 1;
    input.setAttribute('aria-label', field.label);
    input.value = block.attributes[key];
    const original = [...target.childNodes];
    this.restore = () => {
      target.replaceChildren(...original);
      const button = target.querySelector('.edit-text');
      if (button) {
        button.textContent = block.attributes[key] || field.label;
        renderMarks(button, block.attributes[key], block.marks?.[key], element);
        for (const anchor of button.querySelectorAll('a')) anchor.removeAttribute('href');
      }
    };
    target.replaceChildren(input);
    const typingGroup = Symbol('typing');
    const write = () => {
      if (!this.host.field(() => this.model.edit(key, input.value, block, undefined, typingGroup))) {
        input.value = block.attributes[key];
      }
    };
    input.addEventListener('input', event => { if (!event.isComposing) write(); });
    input.addEventListener('compositionend', write);
    input.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        this.close();
        target.querySelector('button')?.focus();
      }
      if (event.key === 'Enter' && !event.shiftKey && ['paragraph','heading'].includes(block.type)) {
        event.preventDefault();
        this.host.command(() => this.model.insertAtSelection(this.host.siblings(block), block, key,
          input.selectionStart, input.selectionEnd, [], true), true);
      }
    });
    input.addEventListener('paste', event => {
      // A rich field in a composite block must never replace the surrounding block.
      // Multiblock paste is a document operation for standalone prose blocks.
      if (!field.rich || !event.clipboardData || !['paragraph', 'heading'].includes(block.type)) return;
      event.preventDefault();
      const start = input.selectionStart, end = input.selectionEnd;
      const html = event.clipboardData.getData('text/html');
      const plain = event.clipboardData.getData('text/plain');
      let caret;
      const accepted = this.host.command(() => {
        const blocks = clipboardBlocks(html, plain, type => this.model.create(type));
        if (blocks.length === 1 && blocks[0].type === 'paragraph') {
          const added = blocks[0], before = block.attributes[key];
          const text = before.slice(0,start) + added.attributes.text + before.slice(end);
          const pos = start + added.attributes.text.length;
          const marks = [...sliceMarks(block.marks?.[key], 0, start),
            ...sliceMarks(added.marks?.text, 0, added.attributes.text.length, start),
            ...sliceMarks(block.marks?.[key], end, before.length, pos)];
          this.model.edit(key, text, block, marks);
          caret = pos;
        } else this.model.insertAtSelection(this.host.siblings(block), block, key, start, end, blocks);
      }, true);
      if (accepted && caret !== undefined) {
        this.active?.querySelector('.canvas-input')?.setSelectionRange(caret, caret);
      }
    });
    if (field.rich) {
      for (const [kind, label] of [['strong','Bold'], ['em','Emphasis'], ['link','Link']]) {
        const button = action(label, () => {
          const start = input.selectionStart, end = input.selectionEnd;
          if (start === end) { this.host.feedback('Select text to format.'); input.focus(); return; }
          let href;
          if (kind === 'link') {
            href = window.prompt('Link destination');
            if (href === null) return;
          }
          this.host.field(() => {
            const marks = block.marks?.[key] ?? [];
            const matching = marks.find(mark => mark.kind === kind && mark.start === start && mark.end === end);
            const next = matching ? marks.filter(mark => mark !== matching) : [...marks, {kind, start, end, ...(href && {href})}];
            return this.model.edit(key, input.value, block, next);
          });
          input.focus();
        });
        button.addEventListener('mousedown', event => event.preventDefault());
        target.append(button);
      }
    }
    input.focus();
    input.setSelectionRange(0, 0);
  }

  close() {
    this.restore?.();
    this.active = null;
    this.restore = null;
  }
}
