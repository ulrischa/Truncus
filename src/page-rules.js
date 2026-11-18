/** A rule violation identifies both the extension and the location in saved JSON. */
export class PageRuleError extends Error {
  constructor(id, path, message) {
    super(message + ' (' + path + ')');
    this.name = 'PageRuleError';
    this.ruleId = id;
    this.path = path;
  }
}

/** Validate and copy descriptors once. A rule can be reused by several page types. */
export function compileRules(rules) {
  if (!Array.isArray(rules)) throw new Error('Expected an array of page rules.');
  const ids = new Set();
  return rules.map(({id, scope = 'document', phase = 'always', check}) => {
    if (typeof id !== 'string' || !id.trim() || ids.has(id) || typeof check !== 'function' ||
        !['document', 'block'].includes(scope) || !['always', 'publish'].includes(phase)) {
      throw new Error('Invalid or duplicate page rule: ' + id);
    }
    ids.add(id);
    return Object.freeze({id, scope, phase, check});
  });
}

function freezeTree(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeTree(child, seen);
  return Object.freeze(value);
}

function runChecks(rules, context) {
  for (const {id, check} of rules) {
    const result = check(Object.freeze(context));
    if (result === undefined) continue;
    if (typeof result !== 'string' || !result.trim()) throw new TypeError('Rule must return a message or undefined: ' + id);
    throw new PageRuleError(id, context.path, result);
  }
}

/** Run extensions after core schema validation, against one detached read-only snapshot. */
export function checkRules(rules, source, phase) {
  const active = rules.filter(rule => rule.phase === 'always' || phase === 'publish');
  if (!active.length) return;
  const document = freezeTree(structuredClone(source));
  const context = {document, phase, path: '$'};
  runChecks(active.filter(rule => rule.scope === 'document'), context);
  const blockRules = active.filter(rule => rule.scope === 'block');
  if (!blockRules.length) return;

  function visit(blocks, parent, slot, prefix) {
    blocks.forEach((block, index) => {
      const path = prefix + '[' + index + ']';
      runChecks(blockRules, {document, phase, block, parent, slot, index, path});
      for (const [key, children] of Object.entries(block.slots)) {
        visit(children, block, key, path + '.slots[' + JSON.stringify(key) + ']');
      }
    });
  }
  visit(document.blocks, null, null, '$.blocks');
}
