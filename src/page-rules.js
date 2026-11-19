import {rootGroups} from './document-tree.js';
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

function runChecks(rules, context, issues) {
  for (const {id, check} of rules) {
    const result = check(Object.freeze(context));
    if (result === undefined) continue;
    for (const item of Array.isArray(result) ? result : [result]) {
      const detail = typeof item === 'string' ? {message: item} : item;
      if (typeof detail?.message !== 'string' || !detail.message.trim()) throw new TypeError('Invalid diagnostic: ' + id);
      const issue = {...detail, ruleId: id, path: detail.path ?? context.path};
      if (issues) issues.push(issue);
      else throw Object.assign(new PageRuleError(id, issue.path, issue.message),
        {field: issue.field, fix: issue.fix});
    }
  }
}

/** Run extensions after core schema validation, against one detached read-only snapshot. */
export function checkRules(rules, source, phase, issues, page, catalog) {
  const active = rules.filter(rule => rule.phase === 'always' || phase === 'publish');
  if (!active.length) return;
  const document = structuredClone(source);
  // Legacy document-level checks can still read their flat view after root migration.
  if (source.version === 3 && !page.explicitSlots) {
    document.blocks = rootGroups(document, page).flatMap(group => group.items);
  }
  freezeTree(document);
  const context = {document, phase, path: '$'};
  runChecks(active.filter(rule => rule.scope === 'document'), context, issues);
  const blockRules = active.filter(rule => rule.scope === 'block');
  if (!blockRules.length) return;

  function visit(blocks, parent, slot, prefix) {
    blocks.forEach((block, index) => {
      const path = prefix + '[' + index + ']';
      if (!catalog.has(block.type)) return;
      runChecks(blockRules, {document, phase, block, parent, slot, index, path}, issues);
      if (!block.slots) return;
      for (const [key, children] of Object.entries(block.slots)) {
        if (Array.isArray(children)) visit(children, block, key, path + '.slots[' + JSON.stringify(key) + ']');
      }
    });
  }
  for (const {items, name, path} of rootGroups(document, page)) visit(items, document.root ?? null, name, path);
}
