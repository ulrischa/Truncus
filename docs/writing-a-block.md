# Writing a block

A block class describes its attributes, child relationships and published HTML. The base custom element builds the inspector from that description. This guide adds a notice that contains editable paragraphs and links.

## 1. Define the component

Create `notice.js` alongside the demo's `index.html`.

```js
import {TruncusBlock, register} from './src/truncus.js';

export class Notice extends TruncusBlock {
  static label = 'Notice';

  static fields = {
    title: {label: 'Title', initial: 'Please note'},
    tone: {label: 'Tone', options: ['information', 'warning'], initial: 'information'}
  };

  static slots = {
    body: {label: 'Content', accept: ['paragraph', 'link'], initial: ['paragraph']}
  };

  static render(attributes, {body}, el) {
    const aside = el('aside');
    aside.className = 'notice notice-' + attributes.tone;
    aside.append(el('strong', attributes.title), ...body);
    return aside;
  }
}

register('notice', Notice);
```

The type key is the persistent identity. Choose a lowercase name beginning with a letter, using letters, digits and hyphens. Registration also defines the browser element `truncus-block-notice`. The label is the editable interface name and can change independently.

## 2. Load it before restoring a document

Add `import './notice.js';` at the top of `demo.js`. Reload the page, choose **Notice** below the outline, then select **Add**. Its title and tone appear as fields. Its content picker offers paragraphs and links. Edit a nested paragraph, save the JSON, open it again, and export HTML to see the resulting aside.

## 3. Configure fields and slots

| Field setting | Meaning |
| --- | --- |
| `label` | Visible input label. |
| `initial` | Initial string value. Defaults to an empty string. |
| `kind: 'multiline'` | Uses a textarea. |
| `kind: 'url'` | Accepts relative references, fragments and HTTP, HTTPS, mailto or tel destinations. An empty value is allowed. |
| `options` | Creates a select and restricts stored values to the supplied strings. Choose a matching initial value. |

| Slot setting | Meaning |
| --- | --- |
| `label` | Section name in the inspector. |
| `accept` | Array of permitted type keys. Omit this to accept any registered type. |
| `initial` | Ordered type keys to instantiate when creating the parent. The default is empty. |
| `min`, `max` | Inclusive limits. Defaults are zero and unlimited. |

Defaults must satisfy the declared rules and terminate. For recursive structures, give at least one recursive slot an empty initial list. The generic editor handles insertion, duplication, reordering and removal for every slot.

## 4. Reuse a repeater

A list of notices can inherit the built-in repeater's inspector and list renderer. Add the following after registering the notice.

```js
import {definition} from './src/truncus.js';

class NoticeList extends definition('repeater') {
  static label = 'Notice list';
  static slots = {
    items: {label: 'Notices', accept: ['notice'], initial: ['notice']}
  };
}

register('notice-list', NoticeList);
```

Each entry remains a whole notice with its own fields and nested children. For the composition used by the built-in link list, see [the repeater and link list classes](../src/blocks/lists.js).

## 5. Customize the inspector when needed

The editor mounts the registered Web Component and calls `bind(block)` when it selects a block. The base class uses a shared HTML template in its shadow root. Native slots named `before-fields` and `after-fields` accept extra inspector controls or instructions. A document slot such as `body` owns persisted children. A native HTML slot projects interface elements into the inspector.

For example, add this method to the notice class.

```js
bind(block) {
  super.bind(block);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.slot = 'after-fields';
  reset.textContent = 'Reset title';
  reset.onclick = () => {
    const title = this.constructor.fields.title.initial;
    this.setAttributeValue('title', title);
    this.bind(block);
  };
  this.replaceChildren(reset);
}
```

Use `setAttributeValue(key, value)` to request a field update. The editor checks it and updates the preview and change event. Treat the supplied block as read-only in custom inspectors.

## Rendering and compatibility

The framework renders children first. Your static `render` receives attributes, one array of rendered child nodes per slot, and the `el(tag, text)` helper. Return a DOM element or fragment. The helper assigns text via `textContent`. Use fixed element names and explicitly chosen attributes. Every registered block runs as trusted application code.

Keep persisted type, field and slot keys stable. Version 1 requires all declared keys, so changing a schema can require a migration. Transform saved JSON before assigning it to `editor.value`, including adding defaults for existing documents. Check your extension with empty slots, duplicate items, punctuation in text, JSON reload and exported HTML.
