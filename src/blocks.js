import {register, safeUrl} from './model.js';
import {TruncusBlock} from './component.js';

const text = (label, initial = '') => ({label, initial});
const collection = (label, accept, initial = []) => ({label, accept, initial});
const one = (label, type) => ({label, accept: [type], initial: [type], min: 1, max: 1});

class Heading extends TruncusBlock {
  static label = 'Heading';
  static fields = {text: text('Heading', 'Heading'), level: {label: 'Level', options: ['1','2','3','4','5','6'], initial: '2'}};
  static render(a, slots, el) { return el('h' + a.level, a.text); }
}
class Paragraph extends TruncusBlock {
  static label = 'Paragraph';
  static fields = {text: {...text('Text', 'Paragraph text'), kind: 'multiline'}};
  static render(a, slots, el) { return el('p', a.text); }
}
class Link extends TruncusBlock {
  static label = 'Link';
  static fields = {text: text('Link text', 'Read more'), href: {label: 'Destination', kind: 'url', initial: '#'}};
  static render(a, slots, el) {
    const link = el('a', a.text);
    if (safeUrl(a.href)) link.setAttribute('href', a.href);
    return link;
  }
}
class Repeater extends TruncusBlock {
  static label = 'Repeater';
  static slots = {items: collection('Items')};
  static render(a, {items}, el) {
    const list = el('ul');
    for (const item of items) {
      const row = el('li');
      row.append(item);
      list.append(row);
    }
    return list;
  }
}
// Specializing the repeater restricts insertion while retaining its editor and renderer.
class LinkRepeater extends Repeater {
  static label = 'Repeated links';
  static slots = {items: collection('Links', ['link'], ['link'])};
}
class LinkList extends TruncusBlock {
  static label = 'Link list';
  static slots = {links: one('List', 'link-repeater')};
  static render(a, {links}) { return links[0]; }
}
class AccordionItem extends TruncusBlock {
  static label = 'Accordion item';
  static fields = {summary: text('Summary', 'Question')};
  static slots = {body: collection('Content', undefined, ['paragraph'])};
  static render(a, {body}, el) {
    const details = el('details');
    details.append(el('summary', a.summary), ...body);
    return details;
  }
}
class Accordion extends TruncusBlock {
  static label = 'Accordion';
  static slots = {items: collection('Panels', ['accordion-item'], ['accordion-item'])};
  static render(a, {items}, el) {
    const group = el('div');
    group.className = 'truncus-accordion';
    group.append(...items);
    return group;
  }
}
class Teaser extends TruncusBlock {
  static label = 'Teaser';
  static slots = {title: one('Title', 'heading'), body: collection('Description', ['paragraph'], ['paragraph']),
    action: {...one('Action', 'link'), min: 0}};
  static render(a, {title, body, action}, el) {
    const article = el('article');
    article.append(...title, ...body, ...action);
    return article;
  }
}

for (const [name, component] of Object.entries({heading: Heading, paragraph: Paragraph, link: Link,
  repeater: Repeater, 'link-repeater': LinkRepeater, 'link-list': LinkList, 'accordion-item': AccordionItem,
  accordion: Accordion, teaser: Teaser})) register(name, component);
