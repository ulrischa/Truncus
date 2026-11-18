const types = new Map();
const namePattern = /^[a-z][a-z0-9-]*$/;

/** Return registered type keys in insertion order, as shown in block pickers. */
export function blockTypes() {
  return [...types.keys()];
}

/** Resolve the class that defines a type's schema, inspector and HTML renderer. */
export function definition(type) {
  const component = types.get(type);
  if (!component) throw new Error('Unknown block type: ' + type);
  return component;
}

/** Register a stable storage key and its associated browser custom element. */
export function register(type, component) {
  if (!namePattern.test(type) || types.has(type)) {
    throw new Error('Invalid or duplicate block: ' + type);
  }
  customElements.define('truncus-block-' + type, component);
  types.set(type, component);
}
