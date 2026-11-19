# Authoring and extension contracts

## Editing in the document

Activate text with a pointer or by tabbing to it and pressing Enter. Text fields use native textarea selection and composition events. Escape returns focus to the field button. In a standalone paragraph or heading, Enter splits at the selection when the owning slot accepts the new paragraph. Shift+Enter inserts a line break. Select text to apply bold, emphasis or a link. Use the inspector for additional fields, including link destinations.

Pasting into prose imports HTML headings, paragraphs, links, semantic emphasis, lists and common Word list paragraphs. The importer builds fresh block data. It drops presentation styles and embedded objects. Plain-text lines become paragraphs. A paste containing a type forbidden in the target slot is rejected as one operation. Complex Word layouts, images, tables and numbering styles are outside this importer.

Move blocks and convert paragraphs or headings in the inspector. **Group adjacent links** collects the contiguous run of sibling link blocks into one link list. **Undo** and **Redo** also work with Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y. History retains the last 100 operations in this editor session. A new document load starts a fresh history.

## A self-contained block module

```js
import {TruncusBlock, register} from '../src/truncus.js';

class Notice extends TruncusBlock {
  static label = 'Notice';
  static fields = {
    title: {label: 'Title', initial: 'Notice', inline: 'strong', rich: true}
  };
  static slots = {
    links: {label: 'Links', action: 'Add link', accept: ['link']}
  };

  static render({title}, {links}, element) {
    const aside = element('aside');
    aside.append(element('strong', title), ...links);
    return aside;
  }
}

register('notice', Notice);
```

An inline selector identifies the element exclusively owned by a text field. Use `inline: true` when the field owns the whole rendered element. The shared renderer applies optional formatting ranges to the same target for preview and export. A slot with a single accepted type and an `action` label gets an insertion button on the canvas. Additional inspector controls can still override `bind()`.

## Document and block migrations

Use `prepareDocument(saved, {upgradeRoot: true})` to convert a flat version 1 or 2 document to version 3 when the original page type is registered. Legacy regions tell the migration where each root block belongs; the unrestricted page assigns all blocks to its content slot. The input stays untouched. Assigning legacy JSON to the editor preserves its document version by default. A new page type declared with named slots always creates version 3.

A block class may declare its own positive integer `static version`. An absent version means 1. Each migration receives a detached block, returns the upgraded block and advances exactly one version:

```js
static version = 2;
static migrations = {
  1(block) {
    block.attributes.title = block.attributes.heading;
    delete block.attributes.heading;
    return block;
  }
};
```

Loading JSON in the editor runs migrations recursively. In a rendering-only host, call `prepareDocument()` before `serializeHTML()`. Missing steps, invalid output or a future version of a known block abort loading without replacing the current draft. A missing block module produces an opaque placeholder; its JSON can be saved again. After registering the module, reassign the saved snapshot to resolve and validate it. Publication requires all modules. The page type must be available to interpret the document's root.

## Independent editor catalogs

```js
import {
  createCatalog, createDocument, defaultCatalog, registerPageType, serializeHTML
} from './src/truncus.js';

const portal = createCatalog(defaultCatalog);
registerPageType('portal-news', {
  label: 'Portal news',
  slots: {body: {label: 'News', accept: ['paragraph'], initial: ['paragraph']}}
}, portal);

const editor = document.querySelector('truncus-editor');
editor.catalog = portal;
editor.value = createDocument('portal-news', {catalog: portal});
const html = serializeHTML(editor.value, {catalog: portal});
```

Calling `createCatalog()` starts with an empty block catalog and the free page type. Register local classes with `catalog.register(key, Component)`. Independent catalogs may register different classes under the same storage key. Passing a base catalog copies its existing registrations; later registrations are local to their own catalog. Use the same catalog for creation, loading, validation and publishing.

## Diagnostics and optional repairs

A block-scoped rule can return a message and its field, plus an optional proposed field value. For example, a publication rule for locally hosted manuals could return:

```js
if (block.type === 'link' && block.attributes.href === '/old-manual/') {
  return {
    field: 'href',
    message: 'The manual has moved. Review the link destination.',
    fix: {label: 'Use the new manual URL', value: '/manual/'}
  };
}
```

The editor collects all rule diagnostics, including paths through repeated slots. A message opens the relevant inspector field. Applying a proposed value is explicit, validated and undoable. Hosts can call `editor.checkPublication()` for the list or `serializeHTML()` to publish. The latter throws when a blocking issue remains. Use `fieldHints` on the page definition for an explanation shown beside a field before an error occurs.
