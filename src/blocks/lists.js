import {TruncusBlock} from '../component.js';

/** Each child owns its content; the repeater supplies the list and item wrappers. */
export class Repeater extends TruncusBlock {
  static label = 'Repeater';
  static slots = {
    items: {label: 'Items'}
  };

  static render(attributes, {items}, element) {
    const list = element('ul');
    for (const item of items) {
      const row = element('li');
      row.append(item);
      list.append(row);
    }
    return list;
  }
}

/** Restrict insertion to links while inheriting the repeater's inspector and renderer. */
export class LinkRepeater extends Repeater {
  static label = 'Repeated links';
  static slots = {
    items: {action: 'Add link', label: 'Links', accept: ['link'], initial: ['link']}
  };
}

export class LinkList extends TruncusBlock {
  static label = 'Link list';
  static slots = {
    links: {label: 'List', accept: ['link-repeater'], initial: ['link-repeater'], min: 1, max: 1}
  };

  static render(attributes, {links}) {
    // The required child already renders the list; a second wrapper would nest two lists.
    return links[0];
  }
}

export class OrderedList extends Repeater {
  static label = 'Ordered list';
  static render(attributes, slots, element) {
    const ordered = element('ol');
    ordered.append(...super.render(attributes, slots, element).childNodes);
    return ordered;
  }
}

/** Preserve multiple paragraphs or nested lists within a single pasted list item. */
export class ListContent extends TruncusBlock {
  static label = 'List item content';
  static slots = {body: {label: 'Content'}};
  static render(attributes, {body}) {
    const fragment = document.createDocumentFragment();
    fragment.append(...body);
    return fragment;
  }
}
