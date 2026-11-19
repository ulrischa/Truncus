# Designing a page type

A page type defines the contract of one editable document. Blocks own their own attributes, child slots and HTML. A page combines those blocks and adds editorial rules. The document stores the page's registry key and an ordered block tree. Executable rules stay in application code.

## Use named slots for new page designs

```js
registerPageType('briefing', {
  label: 'Briefing',
  slots: {
    intro: {label: 'Introduction', accept: ['paragraph'], initial: ['paragraph']},
    body: {label: 'Main text', accept: ['paragraph', 'heading', 'accordion']},
    related: {label: 'Related material', accept: ['link-list'], max: 1}
  }
});
```

`createDocument('briefing')` produces version 3. The root contains the page type, empty attributes and the three named slot arrays. The same paragraph type can occur in both introduction and body. Slot declaration order defines reading order. Named slots and legacy regions are alternative declarations. See [Authoring and extension contracts](authoring.md) for migration and examples of field-level diagnostics.

## Define ordered regions for flat documents

Suppose a feature article opens with one teaser, contains paragraphs and headings, and ends with up to two lists of references. Register the blocks first, then register the page.

```js
import {createDocument, registerPageType} from './src/truncus.js';

registerPageType('journal-article', {
  label: 'Journal article',
  regions: [
    {name: 'lead', accept: ['teaser'], min: 1, max: 1, initial: ['teaser']},
    {name: 'body', accept: ['heading', 'paragraph'], initial: ['paragraph']},
    {name: 'references', accept: ['link-list'], max: 2}
  ],
  fieldOptions: {heading: {level: ['2', '3', '4']}}
});

const editor = document.querySelector('truncus-editor');
editor.value = createDocument('journal-article');
```

New articles begin with a teaser and a paragraph. Add a list, then add another paragraph: the editor places the paragraph before the references. The editor disables moving across region boundaries, deleting the required lead and duplicating a list beyond the maximum. JSON import checks exactly the same bounds and sequence.

| Setting | Contract |
| --- | --- |
| `regions` | Ordered root regions. Omit for an unrestricted root. An empty array permits an empty root only. |
| `name` | Unique region identifier used in diagnostics. |
| `accept` | Registered types belonging to the region. One region may omit this key to accept all unassigned types, including future extensions. |
| `min`, `max` | Inclusive counts for the entire region. Defaults are zero and unlimited. |
| `initial` | Ordered block type keys for new documents. Defaults to empty and must satisfy the region's minimum and maximum. |
| `fieldOptions` | Narrows a registered enum field throughout the whole tree. If the block default is excluded, new instances use the first permitted choice. |
| `rules` | Reusable synchronous checks for document-wide and contextual requirements. |

A type can belong to one root region per page. This lets the editor infer its position from existing version 2 JSON without storing region IDs. Use version 3 named root slots when a type belongs in several positions. Root regions add no HTML wrappers. The block's own slot schema continues to govern children.

## Add a rule without modifying the editor

This example requires a real destination on every teaser action before publication. Authors can keep the placeholder while drafting. The same rule object can be included in any number of page types.

```js
import {registerPageType} from './src/truncus.js';

const teaserDestination = {
  id: 'teaser-destination',
  scope: 'block',
  phase: 'publish',
  check({block, parent, slot}) {
    if (block.type !== 'link' || parent?.type !== 'teaser' || slot !== 'action') return;
    const href = block.attributes.href.trim();
    if (!href || href === '#') return 'Enter a destination for this teaser.';
  }
};

registerPageType('newsroom-page', {
  label: 'Newsroom page',
  rules: [teaserDestination]
});
```

Use `scope: 'document'` (the default) for relationships involving multiple branches or counts across the page. A block rule runs once per node and receives `document`, `block`, `parent`, `slot`, `index`, `path` and the current `phase`. Top-level version 1 and 2 blocks have null parent and slot. Version 3 top-level blocks receive the page root and owning slot name. Document rules receive `document`, `path` and `phase`.

Return `undefined` to accept. To reject, return a message, a diagnostic object or an array of diagnostics. Rule IDs must be unique within a page type. Inputs are read-only snapshots. Checks should be deterministic, synchronous and free of side effects. For a whole-tree scan, use one document rule instead of scanning the whole document from each block.

## Choose when the rule applies

| Operation | Checks |
| --- | --- |
| Create, import, edit, preview, or `validateDocument(doc)` | Block schema, layout, enum restrictions and all `always` rules |
| `serializeHTML(doc)`, `validateDocument(doc, {phase: 'publish'})`, or `renderDocument(doc, {phase: 'publish'})` | All edit checks plus `publish` rules |

Always-on rules must accept the initial draft produced by `createDocument()`. Use publication checks for requirements an author needs time to fulfill. Declarative structural constraints guide the editor controls. Arbitrary rule callbacks run on the proposed result. If a callback rejects an edit, the editor displays its message, restores the previous model and leaves the selection intact. The host receives a change event only after success.

Custom rule rejections throw `PageRuleError` with `ruleId` and `path`. Core schema and layout errors also throw and provide a message. A host application can catch either kind at its save or publish boundary. These checks inspect structured block data. A custom renderer remains responsible for the HTML it emits.

## Pick your framework entry point

- `src/truncus.js` loads standard blocks and the Free, Guide and Feature article page types.
- `src/core.js` loads the editor and public API with an empty block catalog and the unrestricted Free page type. Register your own block classes and page types from this entry point. The default catalog is shared. Assign `editor.catalog` to isolate registrations.

Existing version 1 documents keep their unrestricted behavior. Version 2 documents retain their page type and JSON structure. Existing `requiredLast` definitions are translated into a catch-all content region and a required final region. Use either that shorthand or explicit regions. Register a new page key or migrate stored content when changing a published page contract incompatibly.
