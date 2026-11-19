import {authoringTests} from './authoring.js';
import {TruncusBlock, createBlock, createDocument, registerPageType, register, renderDocument, serializeHTML, validateDocument} from '../src/truncus.js';

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
test('A rejected field edit preserves the draft, focus target and change count', () => {
  const editor = document.createElement('truncus-editor');
  document.body.append(editor);
  editor.value = doc(createBlock('link'));
  let changes = 0;
  editor.addEventListener('truncus-change', () => changes++);
  const inspector = editor.shadowRoot.querySelector('truncus-block-link');
  const destination = inspector.shadowRoot.querySelectorAll('input')[1];
  destination.value = 'javascript:invalid';
  destination.dispatchEvent(new Event('input'));
  assert(editor.value.blocks[0].attributes.href === '#');
  assert(changes === 0);
  destination.value = '/guide';
  destination.dispatchEvent(new Event('input'));
  assert(editor.value.blocks[0].attributes.href === '/guide');
  assert(inspector === editor.shadowRoot.querySelector('truncus-block-link'));
  assert(changes === 1);
  editor.remove();
});
test('Guide constraints apply on import and rendering, including nested headings', () => {
  const guide = createDocument('guide');
  const teaser = createBlock('teaser');
  guide.blocks.unshift(teaser);
  const editor = document.createElement('truncus-editor');
  editor.value = guide;
  assert(editor.value.pageType === 'guide');
  teaser.slots.title[0].attributes.level = '1';
  rejects(() => { editor.value = guide; });
  rejects(() => serializeHTML(guide));
  assert(editor.value.blocks[0].slots.title[0].attributes.level === '2');
  const list = createBlock('link-list');
  for (const blocks of [[], [list, createBlock('heading')], [list, createBlock('link-list')]]) {
    rejects(() => validateDocument({...guide, blocks}));
  }
  rejects(() => validateDocument({...guide, pageType: 'missing'}));
  assert(serializeHTML(doc(teaser)).includes('<h1>'));
});

test('Guide editing reserves the final list and filters heading levels', () => {
  const editor = document.createElement('truncus-editor');
  editor.value = createDocument('guide');
  const settings = editor.shadowRoot.querySelector('#settings');
  const control = label => [...settings.querySelectorAll('button')].find(button => button.textContent === label);
  assert(control('Remove').disabled && control('Duplicate').disabled);
  const tree = editor.shadowRoot.querySelector('#tree');
  const picker = tree.querySelector('select');
  assert(![...picker.options].some(option => option.value === 'link-list'));
  picker.value = 'heading';
  tree.querySelector('.picker button').click();
  assert(editor.value.blocks.map(block => block.type).join() === 'heading,link-list');
  assert(control('Move down').disabled);
  const inspector = settings.querySelector('truncus-block-heading');
  const levels = inspector.shadowRoot.querySelector('select');
  assert([...levels.options].map(option => option.value).join() === '2,3,4,5,6');
  inspector.setAttributeValue('level', '1');
  assert(editor.value.blocks[0].attributes.level === '2');
  const reopened = JSON.parse(JSON.stringify(editor.value));
  editor.value = reopened;
  assert(serializeHTML(editor.value).startsWith('<h2>Heading</h2><ul>'));
});

test('Custom page types apply restricted defaults inside required children', () => {
  registerPageType('test-feature', {
    label: 'Feature',
    requiredLast: 'teaser',
    fieldOptions: {heading: {level: ['3', '4']}}
  });
  const feature = createDocument('test-feature');
  assert(feature.blocks[0].slots.title[0].attributes.level === '3');
  assert(createDocument('free').blocks.length === 0);
});
test('Ordered regions control insertion, movement, duplicates and required counts', () => {
  const editor = document.createElement('truncus-editor');
  editor.value = createDocument('feature');
  const tree = editor.shadowRoot.querySelector('#tree');
  const settings = editor.shadowRoot.querySelector('#settings');
  const action = label => [...settings.querySelectorAll('button')].find(button => button.textContent === label);
  const add = type => {
    tree.querySelector('select').value = type;
    tree.querySelector('.picker button').click();
  };
  assert(action('Move down').disabled && action('Remove').disabled);
  add('link-list');
  action('Duplicate').click();
  assert(action('Duplicate').disabled);
  assert(![...tree.querySelector('select').options].some(option => option.value === 'link-list'));
  add('heading');
  assert(editor.value.blocks.map(block => block.type).join() === 'teaser,paragraph,heading,link-list,link-list');
  assert(action('Move down').disabled && !action('Move up').disabled);
  const invalid = editor.value;
  invalid.blocks.reverse();
  rejects(() => { editor.value = invalid; });
  assert(editor.value.blocks[0].type === 'teaser');
});

test('Extension rules can reject moves and removals without losing state or notifying the host', () => {
  registerPageType('ordered-pair', {
    label: 'Pair',
    regions: [{name: 'content', initial: ['heading', 'paragraph']}],
    rules: [{
      id: 'opening-pair',
      check({document}) {
        const [first, second] = document.blocks;
        if (first?.type !== 'heading' || second?.type !== 'paragraph') return 'Keep the opening pair.';
      }
    }]
  });
  const editor = document.createElement('truncus-editor');
  editor.value = createDocument('ordered-pair');
  let changes = 0;
  editor.addEventListener('truncus-change', () => changes++);
  const initial = JSON.stringify(editor.value);
  for (const label of ['Move down', 'Remove', 'Duplicate']) {
    const buttons = editor.shadowRoot.querySelectorAll('#settings button');
    [...buttons].find(button => button.textContent === label).click();
    assert(editor.shadowRoot.querySelector('#feedback').textContent.includes('Keep the opening pair.'));
    assert(JSON.stringify(editor.value) === initial && changes === 0);
  }
});

test('Reusable publish rules distinguish drafts and identify nested violations', () => {
  registerPageType('publish-test', {
    label: 'Publish test',
    rules: [{
      id: 'concrete-action',
      scope: 'block',
      phase: 'publish',
      check({parent, slot, block}) {
        if (parent?.type === 'teaser' && slot === 'action' && block.attributes.href === '#') {
          return 'Enter the teaser destination.';
        }
      }
    }]
  });
  const document = createDocument('publish-test');
  document.blocks.push(createBlock('teaser'));
  assert(renderDocument(document).querySelector('a'));
  let issue;
  try { serializeHTML(document); } catch (error) { issue = error; }
  assert(issue.ruleId === 'concrete-action' && issue.path === '$.blocks[0].slots["action"][0]');
  document.blocks[0].slots.action[0].attributes.href = '/contact';
  assert(serializeHTML(document).includes('/contact'));
});

test('Configuration errors and cyclic defaults fail explicitly', () => {
  rejects(() => registerPageType('bad-regions', {
    label: 'Invalid', regions: [{name: 'one', accept: ['link']}, {name: 'two', accept: ['link']}]
  }));
  rejects(() => registerPageType('bad-default', {
    label: 'Invalid', regions: [{name: 'one', min: 1}]
  }));
  rejects(() => registerPageType('bad-rule', {label: 'Invalid', rules: [{id: 'missing-check'}]}));
  class Recursive extends TruncusBlock {
    static slots = {items: {label: 'Items', initial: ['recursive-test']}};
  }
  register('recursive-test', Recursive);
  rejects(() => createBlock('recursive-test'));
});
authoringTests(test, assert, rejects);
document.documentElement.dataset.result = failures ? 'failed' : 'passed';
