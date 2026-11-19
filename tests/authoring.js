import {
  TruncusBlock, createBlock, createDocument, createCatalog, defaultCatalog, registerPageType,
  prepareDocument, serializeHTML, validateDocument
} from '../src/truncus.js';

export function authoringTests(test, assert, rejects) {
  function editorFor(doc, catalog = defaultCatalog) {
    const editor = document.createElement('truncus-editor');
    editor.catalog = catalog;
    editor.value = doc;
    document.body.append(editor);
    return editor;
  }
  function control(root, label) {
    const match = [...root.querySelectorAll('button')].find(button => button.textContent === label && !button.disabled);
    if (!match) throw new Error('Missing control: ' + label);
    return match;
  }
  const legacy = (...blocks) => ({version: 1, blocks});
  const paste = (input, html, plain = '') => {
    const event = new Event('paste', {cancelable: true});
    Object.defineProperty(event, 'clipboardData', {value: {getData: key => key === 'text/html' ? html : plain}});
    input.dispatchEvent(event);
  };

  test('Root migration preserves public HTML, old JSON and explicit slot ownership', () => {
    for (const old of [legacy(createBlock('teaser')), createDocument('feature'), createDocument('guide')]) {
      const original = JSON.stringify(old);
      const current = prepareDocument(old, {upgradeRoot: true});
      assert(current.version === 3 && !Object.hasOwn(current, 'blocks'));
      assert(JSON.stringify(old) === original && serializeHTML(old) === serializeHTML(current));
    }
    const doc = createDocument('topic');
    doc.root.slots.intro.push(createBlock('paragraph'));
    doc.root.slots.body.push(createBlock('paragraph'));
    const editor = editorFor(doc);
    assert(editor.value.root.slots.intro.length === 2 && editor.value.root.slots.body.length === 2);
    control(editor.shadowRoot.querySelector('#settings'), 'Move to Main text').click();
    assert(editor.value.root.slots.body[2].type === 'heading');
    editor.undo();
    assert(JSON.stringify(editor.value) === JSON.stringify(doc));
    editor.remove();
  });

  test('Canvas text editing, IME composition, paragraph split and undo/redo', () => {
    const editor = editorFor(legacy(createBlock('paragraph')));
    const shadow = editor.shadowRoot;
    shadow.querySelector('.edit-text').click();
    const input = shadow.querySelector('.canvas-input');
    input.value = 'BeforeAfter';
    const composing = new Event('input');
    Object.defineProperty(composing, 'isComposing', {value: true});
    input.dispatchEvent(composing);
    assert(editor.value.blocks[0].attributes.text === 'Paragraph text');
    input.dispatchEvent(new Event('compositionend'));
    input.setSelectionRange(6, 6);
    const enter = new Event('keydown', {bubbles: true, cancelable: true});
    Object.defineProperty(enter, 'key', {value: 'Enter'});
    input.dispatchEvent(enter);
    assert(editor.value.blocks.map(block => block.attributes.text).join('|') === 'Before|After');
    editor.undo();
    assert(editor.value.blocks[0].attributes.text === 'BeforeAfter' && editor.value.blocks.length === 1);
    editor.redo();
    assert(editor.value.blocks.length === 2);
    editor.remove();
  });

  test('Word and web paste preserves headings, list structure and safe marks in one undo step', () => {
    const editor = editorFor(legacy(createBlock('paragraph')));
    const shadow = editor.shadowRoot;
    shadow.querySelector('.edit-text').click();
    const input = shadow.querySelector('.canvas-input');
    input.select();
    paste(input, '<h2 style="color:red">River</h2><p><b>High</b> <a href="/levels">water</a></p>' +
      '<p class="MsoListParagraph"><span style="mso-list:Ignore">1. </span>First</p>' +
      '<p class="MsoListParagraph"><span style="mso-list:Ignore">2. </span>Second</p>' +
      '<ul><li>Nested<ol><li>child</li></ol></li></ul>');
    const html = serializeHTML(editor.value);
    assert(html.startsWith('<h2>River</h2><p><strong>High</strong> <a href="/levels">water</a></p>'));
    assert(html.includes('<ol><li><p>First</p></li><li><p>Second</p></li></ol>'));
    assert(html.includes('<ul><li><p>Nested</p><ol>') && !html.includes('style='));
    editor.undo();
    assert(editor.value.blocks.length === 1 && editor.value.blocks[0].attributes.text === 'Paragraph text');
    editor.redo();
    assert(serializeHTML(editor.value) === html);
    editor.remove();
  });

  test('Formatting, block conversion and link grouping survive reopening', () => {
    const editor = editorFor(legacy(createBlock('paragraph'), createBlock('link'), createBlock('link')));
    const shadow = editor.shadowRoot;
    shadow.querySelector('.edit-text').click();
    shadow.querySelector('.canvas-input').setSelectionRange(0,9);
    control(shadow.querySelector('#preview'), 'Bold').click();
    control(shadow.querySelector('#settings'), 'Convert to heading').click();
    assert(serializeHTML(editor.value).startsWith('<h2><strong>Paragraph</strong> text</h2>'));
    shadow.querySelectorAll('.edit-text')[1].click();
    control(shadow.querySelector('#settings'), 'Group adjacent links').click();
    editor.value = JSON.parse(JSON.stringify(editor.value));
    assert(editor.value.blocks[1].slots.links[0].slots.items.length === 2);
    control(shadow.querySelector('#preview'), 'Add link').click();
    assert(editor.value.blocks[1].slots.links[0].slots.items.length === 3);
    editor.remove();
  });

  test('Publication finds every affected field and repairs one explicitly with undo', () => {
    registerPageType('test-repairs', {
      label: 'Repairs', slots: {links: {initial: ['link','link']}},
      rules: [{id: 'destination', scope: 'block', phase: 'publish', check({block}) {
        if (block.attributes.href === '#') return {message: 'Choose destination', field: 'href',
          fix: {label: 'Use homepage', value: '/'}};
      }}]
    });
    const editor = editorFor(createDocument('test-repairs'));
    let issues = editor.checkPublication();
    assert(issues.length === 2 && issues[0].path !== issues[1].path);
    const panel = editor.shadowRoot.querySelector('#issues');
    control(panel,'Choose destination').click();
    const inspector = editor.shadowRoot.querySelector('[data-inspector]');
    assert(inspector.shadowRoot.activeElement?.dataset.field === 'href');
    control(panel,'Use homepage').click();
    assert(editor.checkPublication().length === 1);
    editor.undo();
    assert(editor.checkPublication().length === 2);
    editor.remove();
  });

  test('Independent catalogs resolve identical keys and migrate only known block versions', () => {
    const a = createCatalog(), b = createCatalog();
    class Note extends TruncusBlock {
      static label = 'Note';
      static version = 2;
      static fields = {text: {label: 'Text', inline: true}};
      static migrations = {1(block) {
        block.attributes.text = block.attributes.old;
        delete block.attributes.old;
        return block;
      }};
      static render({text}, slots, el) { return el('aside', text); }
    }
    class Quote extends Note {
      static render({text}, slots, el) { return el('blockquote', text); }
    }
    a.register('local-note', Note);
    b.register('local-note', Quote);
    const original = legacy({type:'local-note', attributes:{old:'Keep this'}, slots:{}});
    const first = editorFor(original, a), second = editorFor(original, b);
    assert(first.value.blocks[0].version === 2 && original.blocks[0].attributes.old === 'Keep this');
    assert(serializeHTML(first.value,{catalog:a}) === '<aside>Keep this</aside>');
    assert(serializeHTML(second.value,{catalog:b}) === '<blockquote>Keep this</blockquote>');
    const missing = editorFor(original);
    assert(JSON.stringify(missing.value) === JSON.stringify(original));
    assert(missing.shadowRoot.querySelector('#preview').textContent.includes('Missing module'));
    assert(missing.checkPublication().length === 1);
    rejects(() => serializeHTML(missing.value));
    missing.catalog = a;
    assert(serializeHTML(missing.value, {catalog:a}) === '<aside>Keep this</aside>');
    first.remove(); second.remove(); missing.remove();
  });
}
