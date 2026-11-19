/** Return root collections in schema order, independently of JSON key order. */
export function rootGroups(doc, page) {
  if (doc.version !== 3) return [{name: null, slot: {label: 'Document'}, items: doc.blocks, path: '$.blocks'}];
  return Object.entries(page.slots).map(([name, slot]) => ({
    name, slot, items: doc.root.slots[name], path: '$.root.slots[' + JSON.stringify(name) + ']'
  }));
}

export function childPath(path, name) {
  return path + '.slots[' + JSON.stringify(name) + ']';
}
