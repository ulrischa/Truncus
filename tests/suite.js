import {TruncusBlock, createBlock, register, renderDocument, serializeHTML, validateDocument} from '../src/truncus.js';

const results = document.querySelector('#results');
let failures = 0;
function assert(value) { if (!value) throw new Error('Assertion failed'); }
function rejects(fn) {
  try { fn(); } catch { return; }
  throw new Error('Expected rejection');
}
function test(name, fn) {
  try { fn(); results.textContent += 'PASS ' + name + '\n'; }
  catch (error) { failures++; results.textContent += 'FAIL ' + name + ' — ' + error.message + '\n'; }
}
const doc = (...blocks) => ({version: 1, blocks});

test('Link lists reuse a repeater and render native list items', () => {
  const list = createBlock('link-list');
  const items = list.slots.links[0].slots.items;
  items.push(createBlock('link'));
  items[1].attributes = {text: 'Home', href: '/'};
  const html = serializeHTML(JSON.parse(JSON.stringify(doc(list))));
  assert(html === '<ul><li><a href="#">Read more</a></li><li><a href="/">Home</a></li></ul>');
});
test('Teaser and accordion retain their semantic elements', () => {
  const fragment = renderDocument(doc(createBlock('teaser'), createBlock('accordion')));
  assert(fragment.querySelector('article > h2 + p + a'));
  assert(fragment.querySelector('details > summary + p'));
});
test('Plain text is escaped and unsafe URLs are rejected', () => {
  const p = createBlock('paragraph');
  p.attributes.text = '<img src=x>';
  assert(serializeHTML(doc(p)).includes('&lt;img'));
  const link = createBlock('link');
  link.attributes.href = 'javascript:alert(1)';
  rejects(() => serializeHTML(doc(link)));
});
test('Slot type, cardinality and ownership are enforced', () => {
  const teaser = createBlock('teaser');
  teaser.slots.title = [];
  rejects(() => validateDocument(doc(teaser)));
  teaser.slots.title.push(createBlock('link'));
  rejects(() => validateDocument(doc(teaser)));
  const repeat = createBlock('repeater');
  repeat.slots.items.push(repeat);
  rejects(() => validateDocument(doc(repeat)));
});
test('Custom blocks participate in editing, JSON and rendering', () => {
  class Note extends TruncusBlock {
    static label = 'Note';
    static fields = {message: {label: 'Message', initial: 'Remember'}};
    static render(a, slots, el) { return el('aside', a.message); }
  }
  register('note', Note);
  const editor = document.createElement('truncus-editor');
  document.body.append(editor);
  editor.value = doc(createBlock('note'));
  const input = editor.shadowRoot.querySelector('truncus-block-note').shadowRoot.querySelector('input');
  input.value = 'New value';
  input.dispatchEvent(new Event('input'));
  assert(serializeHTML(editor.value) === '<aside>New value</aside>');
  const copy = editor.value;
  copy.blocks.length = 0;
  rejects(() => { editor.value = {version: 2}; });
  assert(editor.value.blocks.length === 1);
  editor.remove();
});
test('Repeated fields support add, edit, duplicate, reorder, remove and reopen', () => {
  const editor = document.createElement('truncus-editor');
  document.body.append(editor);
  editor.value = doc(createBlock('repeater'));
  const settings = editor.shadowRoot.querySelector('#settings');
  const click = label => [...settings.querySelectorAll('button')]
    .find(control => control.textContent === label && !control.disabled).click();
  const write = text => {
    const input = settings.querySelector('truncus-block-paragraph').shadowRoot.querySelector('textarea');
    input.value = text;
    input.dispatchEvent(new Event('input'));
  };
  settings.querySelector('select').value = 'paragraph';
  click('Add');
  write('First');
  click('Duplicate');
  write('Second');
  click('Move up');
  assert(serializeHTML(editor.value) === '<ul><li><p>Second</p></li><li><p>First</p></li></ul>');
  click('Remove');
  editor.value = JSON.parse(JSON.stringify(editor.value));
  assert(serializeHTML(editor.value) === '<ul><li><p>First</p></li></ul>');
  editor.remove();
});
document.documentElement.dataset.result = failures ? 'failed' : 'passed';
