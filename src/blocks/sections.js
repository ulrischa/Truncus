import {TruncusBlock} from '../component.js';

/** One independently expandable panel; its body accepts any registered block. */
export class AccordionItem extends TruncusBlock {
  static label = 'Accordion item';
  static fields = {
    summary: {inline: 'summary', label: 'Summary', initial: 'Question'}
  };
  static slots = {
    body: {label: 'Content', initial: ['paragraph']}
  };

  static render({summary}, {body}, element) {
    const details = element('details');
    details.append(element('summary', summary), ...body);
    return details;
  }
}

export class Accordion extends TruncusBlock {
  static label = 'Accordion';
  static slots = {
    items: {action: 'Add section', label: 'Panels', accept: ['accordion-item'], initial: ['accordion-item']}
  };

  static render(attributes, {items}, element) {
    const group = element('div');
    group.className = 'truncus-accordion';
    group.append(...items);
    return group;
  }
}

/** Each relationship has its own cardinality and position in the published article. */
export class Teaser extends TruncusBlock {
  static label = 'Teaser';
  static slots = {
    title: {label: 'Title', accept: ['heading'], initial: ['heading'], min: 1, max: 1},
    body: {label: 'Description', accept: ['paragraph'], initial: ['paragraph']},
    action: {label: 'Action', accept: ['link'], initial: ['link'], min: 0, max: 1}
  };

  static render(attributes, {title, body, action}, element) {
    const article = element('article');
    article.append(...title, ...body, ...action);
    return article;
  }
}
