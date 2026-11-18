import {createBlock, createDocument, pageType, pageTypes, serializeHTML} from './src/truncus.js';

const editor = document.querySelector('truncus-editor');
const status = document.querySelector('#status');
const file = document.querySelector('#file');
const storageKey = 'truncus.document.v1';

function example() {
  const heading = createBlock('heading');
  heading.attributes = {text: 'Field notes', level: '1'};
  const intro = createBlock('paragraph');
  intro.attributes.text = 'A field guide begins with a good observation. Use this page to collect findings and point readers toward further reading.';
  const accordion = createBlock('accordion');
  const panel = accordion.slots.items[0];
  panel.attributes.summary = 'What belongs in a field note?';
  panel.slots.body[0].attributes.text = 'Record the location, date, and what you observed.';
  const links = createBlock('link-list');
  links.slots.links[0].slots.items[0].attributes = {text: 'Truncus project', href: 'https://github.com/ulrischa/Truncus'};
  return {version: 1, blocks: [heading, intro, accordion, links]};
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(editor.value));
    status.textContent = 'Saved in this browser.';
  } catch { status.textContent = 'Browser storage unavailable. Use Save JSON to keep your work.'; }
}

editor.value = example();
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) editor.value = JSON.parse(saved);
  status.textContent = saved ? 'Restored from this browser.' : 'Example document';
} catch { status.textContent = 'Could not restore the local draft. Showing the example document.'; }
editor.addEventListener('truncus-change', persist);

const typePicker = document.querySelector('#new-type');
for (const key of pageTypes()) {
  typePicker.add(new Option(pageType(key).label, key));
}
document.querySelector('#new').onclick = () => {
  if (!window.confirm('Replace the current draft? Use Save JSON first to keep a copy.')) return;
  editor.value = createDocument(typePicker.value);
  persist();
};

document.querySelector('#import').onclick = () => file.click();
file.onchange = async () => {
  const selected = file.files[0];
  if (!selected) return;
  try {
    editor.value = JSON.parse(await selected.text());
    persist();
  } catch (error) { status.textContent = 'Could not open document. ' + error.message; }
  file.value = '';
};

function download(name, mime, content) {
  const url = URL.createObjectURL(new Blob([content], {type: mime}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.querySelector('#save').onclick = () =>
  download('truncus.json', 'application/json', JSON.stringify(editor.value, null, 2));
document.querySelector('#export').onclick = () =>
  download('truncus.html', 'text/html', '<!doctype html>\n<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Truncus document</title><main>' + serializeHTML(editor.value) + '</main></html>');
