import {safeUrl} from './model.js';

const ignored = new Set(['STYLE','SCRIPT','META','LINK','TEMPLATE','IFRAME','OBJECT','SVG','IMG','NOSCRIPT']);

/** Parse inert clipboard markup; only explicitly mapped text, marks and blocks enter the tree. */
export function clipboardBlocks(html, plain, create) {
  function readInline(node, output, active = []) {
    if (node.nodeType === 3 || node.nodeName === 'BR') {
      const start = output.text.length;
      output.text += node.nodeName === 'BR' ? '\n' : node.textContent;
      if (output.text.length > start) for (const mark of active) output.marks.push({...mark, start, end: output.text.length});
      return;
    }
    if (ignored.has(node.nodeName)) return;
    let mark;
    if (['STRONG','B'].includes(node.nodeName)) mark = {kind: 'strong'};
    if (['EM','I'].includes(node.nodeName)) mark = {kind: 'em'};
    if (node.nodeName === 'A' && safeUrl(node.getAttribute('href') ?? '')) mark = {kind: 'link', href: node.getAttribute('href')};
    for (const child of node.childNodes) readInline(child, output, mark ? [...active, mark] : active);
  }
  function paragraph(nodes, level) {
    const block = create(level ? 'heading' : 'paragraph');
    const data = {text: '', marks: []};
    for (const node of nodes) readInline(node, data);
    block.attributes.text = data.text;
    if (level) block.attributes.level = level;
    if (data.marks.length) block.marks = {text: data.marks};
    return block;
  }
  function walk(nodes) {
    const blocks = [], inline = [];
    let wordList = null;
    const flush = () => {
      if (inline.some(node => node.textContent.trim() || node.nodeName === 'BR')) blocks.push(paragraph(inline));
      inline.length = 0;
    };
    for (const node of nodes) {
      if (ignored.has(node.nodeName)) continue;
      // Word often emits list-shaped paragraphs with a separate marker span.
      if (node.nodeName === 'P' && (/MsoListParagraph/i.test(node.className) || /mso-list:/i.test(node.getAttribute('style') ?? ''))) {
        flush();
        const copy = node.cloneNode(true);
        const marker = [...copy.querySelectorAll('span')].find(span => /mso-list:\s*ignore/i.test(span.getAttribute('style') ?? ''));
        const ordered = /^\s*(?:\d+|[a-z])[.)]/i.test(marker?.textContent ?? copy.textContent);
        marker?.remove();
        const type = ordered ? 'ordered-list' : 'repeater';
        if (wordList?.type !== type) {
          wordList = create(type);
          blocks.push(wordList);
        }
        wordList.slots.items.push(paragraph([copy]));
        continue;
      }
      if (node.nodeType !== 3 || node.textContent.trim()) wordList = null;
      if (/^H[1-6]$/.test(node.nodeName) || node.nodeName === 'P') {
        flush(); blocks.push(paragraph([node], node.nodeName.startsWith('H') ? node.nodeName[1] : undefined));
      } else if (['UL','OL'].includes(node.nodeName)) {
        flush();
        const list = create(node.nodeName === 'OL' ? 'ordered-list' : 'repeater');
        for (const item of node.children) {
          if (item.nodeName !== 'LI') continue;
          const parts = walk(item.childNodes);
          if (parts.length <= 1) list.slots.items.push(parts[0] ?? paragraph([]));
          else {
            const group = create('list-content');
            group.slots.body = parts;
            list.slots.items.push(group);
          }
        }
        blocks.push(list);
      } else if (['DIV','SECTION','ARTICLE','MAIN','BODY'].includes(node.nodeName)) {
        flush(); blocks.push(...walk(node.childNodes));
      } else inline.push(node);
    }
    flush();
    return blocks;
  }
  if (html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const blocks = walk(template.content.childNodes);
    if (blocks.length) return blocks;
  }
  return plain.split(/\r\n|\r|\n/).map(text => {
    const block = create('paragraph');
    block.attributes.text = text;
    return block;
  });
}
