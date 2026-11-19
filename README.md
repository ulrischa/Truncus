# Truncus

Truncus is a dependency-free block editor built with native Web Components and ES modules. A block owns typed attributes and named, ordered slots. A slot describes which blocks belong there and how many it can hold. The editor reads these rules to build its controls, and the renderer uses the same structure to produce HTML.

For example, a link list owns one link repeater. The repeater owns ordinary links. Editing a link inside a list uses the same fields and rendering code as editing a standalone link.

## Try the editor

**On Apache or IIS**, place `index.html`, `demo.js` and the complete `src/` directory together in a web-accessible directory, for example `/truncus/`. Open that directory's URL in your browser. The server must serve JavaScript modules with a JavaScript MIME type. Truncus runs entirely in the browser and requires no build step.

**For a local preview with Node.js and npm**, run this command from the repository root. On first use, npm may prompt to download the `http-server` development tool.

```sh
npx http-server . -a 127.0.0.1 -p 8000
```

Open [the local demo](http://127.0.0.1:8000/). To stop the server, press **Ctrl+C** in the terminal.

### Editing and publishing a page

1. Choose **Topic page** and **New page**. Click the heading in the document canvas and start writing. Add paragraphs to **Introduction** or **Main text**. The saved document remembers which slot owns each paragraph.
2. Press **Enter** inside a main-text paragraph to split it. Select text to apply a link, bold or emphasis. Paste headings, paragraphs or lists from a website or Word. Use **Undo** to reverse the whole paste.
3. Add a link list to **Further information**. Select **Add link** right below the list, type the label and choose **Destination** to set the URL. The outline and inspector remain available for moving or converting blocks.
4. **Save JSON** downloads the editable source. **Open JSON** restores it. **Check publication** lists outstanding issues. Select a message to jump to its field. A rule may also offer an explicit correction.
5. **Export HTML** downloads a standalone page. Rename it, for example to `river-report.html`, and upload it through your usual publishing process. Keep the matching JSON in your editorial files.
6. To update the page, open the JSON, edit it, save a new JSON copy and replace the exported HTML at the same URL.

The demo stores one draft per browser origin in local storage. Opening another document replaces that draft. Save a JSON copy if you want to keep both. The embeddable editor leaves storage to its host.

## Page types

Choose **Guide** in the new-page selector and select **New page**. Truncus creates the required final link list. Add a heading or teaser: the editor inserts it before the list and offers heading levels 2–6, including inside nested blocks. You can edit the links in the final list. The list itself stays in place. **Free page** allows all heading levels and imposes no final block.

Choose **Feature article** for a different structure: one opening teaser, a body of headings, paragraphs or accordions, and up to two reference lists. Adding a block places it in the appropriate region.

Define named root slots (including repeated use of the same type in several slots), ordered root regions, field restrictions and reusable validation rules through the public API. Rules may inspect the whole document or a block in its parent slot. Publication-only checks let authors save an incomplete draft. [Designing a page type](docs/page-types.md) walks through a complete example, rule contexts, compatibility and the core-only entry point.

## Built-in blocks

| Type | Fields or child slots | Output |
| --- | --- | --- |
| `heading` | Text and level 1–6 | `h1` through `h6` |
| `paragraph` | Text and optional formatting ranges | `p` |
| `link` | Link text and destination | `a` |
| `repeater` | Ordered `items` of any registered type | `ul` with one `li` per item |
| `ordered-list` | Ordered items | `ol` with one `li` per item |
| `list-content` | Multiple blocks in one list item | Child content in reading order |
| `link-repeater` | Repeater restricted to `link` items | Same list renderer as `repeater` |
| `link-list` | Exactly one `link-repeater` in `links` | Its repeater's list |
| `accordion-item` | Summary and a `body` slot | `details` and `summary` |
| `accordion` | Ordered `accordion-item` children | A group of native disclosures |
| `teaser` | One heading, zero or more paragraphs, and an optional link | `article` |

## Embed Truncus

```html
<truncus-editor id="article"></truncus-editor>
<script type="module">
  import {createBlock} from './src/truncus.js';

  const editor = document.querySelector('#article');
  const heading = createBlock('heading');
  heading.attributes.text = 'Water quality';
  editor.value = {version: 1, blocks: [heading]};

  editor.addEventListener('truncus-change', () => {
    const source = editor.value;
    // Save the editable snapshot through the host application's storage layer.
    // In the separate publish action, call serializeHTML(source) and handle rule errors.
  });
</script>
```

| API | Contract |
| --- | --- |
| `createBlock(type)` | Creates a fresh block with its default fields and children. |
| `editor.value` | Gets a detached document snapshot. Assignment validates a copy before replacing the current document. |
| `truncus-change` | Bubbles after an accepted user edit. Assigning `value` loads a document without firing this event. |
| `validateDocument(doc)` | Returns the input on success and throws on invalid data. |
| `renderDocument(doc)` | Returns a validated DOM fragment. Insert it with `target.replaceChildren(renderDocument(doc))`. |
| `serializeHTML(doc)` | Returns an HTML fragment for the document. The demo adds the page wrapper when downloading it. |
| `register(type, Component)` | Registers a block class and its custom element. |
| `blockTypes()`, `definition(type)` | List registered type keys or retrieve a block class. |

## Storage and rendering

The editable format is a versioned JSON tree. Array order is reading order. Every block has a type, an attributes object and a slots object, including blocks with no children.

```json
{
  "version": 1,
  "blocks": [
    {
      "type": "paragraph",
      "attributes": {"text": "The river is rising."},
      "slots": {}
    }
  ]
}
```

Keep JSON as the source for later editing. HTML contains the published semantics. Multiple block compositions can produce identical HTML, so the editor reopens JSON. Published HTML inherits the destination site's styles. Editor controls are isolated in shadow roots.

All registered field values are strings. Validation checks known block types, field keys, enum choices, URL schemes, slot membership and cardinality. It limits documents to 5,000 blocks and 64 levels. Each child belongs to a single parent or to the document root. Invalid imports leave the current document intact. Unregistered blocks are retained as opaque draft data. Publishing requires their modules.

## Extend and test

See [Authoring and extension contracts](docs/authoring.md) for inline fields, block migrations, undo, diagnostics and isolated catalogs. Follow [Writing a block](docs/writing-a-block.md) for a complete custom block, a constrained repeater and an inspector extension. Open [the browser tests](http://127.0.0.1:8000/tests/) with the same local server to run the dependency-free regression suite.

## How the code fits together

| When working on… | Start here |
| --- | --- |
| Block defaults, type registration or validation of imported JSON | [Document schema and validator](src/model.js) |
| Editing a field, inserting a child or choosing what stays selected after removal | [EditorDocument](src/editor-document.js) |
| Keyboard focus, the outline, block settings or change notifications | [TruncusEditor](src/editor.js) |
| Controls shared by custom block inspectors | [TruncusBlock](src/component.js) |
| Converting a document into a DOM fragment or HTML | [Renderer](src/renderer.js) |
| Built-in blocks | [Text and links](src/blocks/text.js), [repeaters and lists](src/blocks/lists.js), [accordions and teasers](src/blocks/sections.js) |

For example, typing in a link field calls `TruncusBlock.setAttributeValue()`. The inspector emits `truncus-edit`. The editor asks its `EditorDocument` to validate the edit. An accepted value refreshes the outline and preview, then triggers `truncus-change` for the host to save. The inspector stays mounted so the caret stays in place. A rejected value leaves the saved document intact and displays feedback.

To trace publishing, start at `renderDocument()`. It validates the tree, renders the children in each slot, then passes those nodes to the parent's static `render()` method. The preview and HTML export use this same path.
