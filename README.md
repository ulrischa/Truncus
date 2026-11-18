# Truncus

Truncus is a dependency-free block editor built with native Web Components and ES modules. A block owns typed attributes and named, ordered slots. A slot describes which blocks belong there and how many it can hold. The editor reads these rules to build its controls, and the renderer uses the same structure to produce HTML.

For example, a link list owns one link repeater. The repeater owns ordinary links. Editing a link inside a list uses the same fields and rendering code as editing a standalone link.

## Try the editor

Serve the repository from a static HTTP server. With Python installed, run this command from the repository root.

```sh
python -m http.server 8000
```

Open [the demo](http://localhost:8000/). On Windows, the equivalent launcher command is `py -m http.server 8000`. For IIS or Apache, copy the project to a static directory and serve JavaScript modules with a JavaScript MIME type. There is no build step or package installation.

1. Select a block in **Document outline**. Edit its fields in **Block settings** and watch **Live preview**.
2. To add a top-level block, choose its type below the outline and select **Add**. To insert a nested block, use the picker inside its parent's settings.
3. Try adding a **Link list**. Select **Edit Repeated links**, then **Add** to insert another link. Select **Move up**, **Move down**, **Duplicate**, or **Remove** on a link to manage the list. The controls respect the slot's minimum and maximum size.
4. **Save JSON** downloads the editable source. **Open JSON** validates and restores it. **Export HTML** downloads a standalone page with native headings, paragraphs, links, lists, articles, and disclosures. The exported page works without editor JavaScript.

The demo stores one draft per browser origin in local storage. Opening another document replaces that draft. Save a JSON copy if you want to keep both. The embeddable editor leaves storage to its host.

## Built-in blocks

| Type | Fields or child slots | Output |
| --- | --- | --- |
| `heading` | Text and level 1–6 | `h1` through `h6` |
| `paragraph` | Plain text | `p` |
| `link` | Link text and destination | `a` |
| `repeater` | Ordered `items` of any registered type | `ul` with one `li` per item |
| `link-repeater` | Repeater restricted to `link` items | Same list renderer as `repeater` |
| `link-list` | Exactly one `link-repeater` in `links` | Its repeater's list |
| `accordion-item` | Summary and a `body` slot | `details` and `summary` |
| `accordion` | Ordered `accordion-item` children | A group of native disclosures |
| `teaser` | One heading, zero or more paragraphs, and an optional link | `article` |

## Embed Truncus

```html
<truncus-editor id="article"></truncus-editor>
<script type="module">
  import {createBlock, serializeHTML} from './src/truncus.js';

  const editor = document.querySelector('#article');
  const heading = createBlock('heading');
  heading.attributes.text = 'Water quality';
  editor.value = {version: 1, blocks: [heading]};

  editor.addEventListener('truncus-change', () => {
    const source = editor.value;
    const html = serializeHTML(source);
    // Pass source to your storage layer and html to your publishing layer.
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

All registered field values are strings. Validation checks known block types, field keys, enum choices, URL schemes, slot membership and cardinality. It limits documents to 5,000 blocks and 64 levels. Each child belongs to a single parent or to the document root. Invalid imports leave the current document intact. Register custom types before loading documents that use them.

## Extend and test

Follow [Writing a block](docs/writing-a-block.md) for a complete custom block, a constrained repeater and an inspector extension. Open [the browser tests](http://localhost:8000/tests/) with the same local server to run the dependency-free regression suite.

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
