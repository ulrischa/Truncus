/** Assign plain text through the DOM so document values remain literal text. */
export function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
