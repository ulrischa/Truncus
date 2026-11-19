import {TruncusBlock} from '../component.js';
import {safeUrl} from '../model.js';

/** The stored level is an enum so the renderer can construct a native heading tag. */
export class Heading extends TruncusBlock {
  static label = 'Heading';
  static fields = {
    text: {inline: true, rich: true, label: 'Heading', initial: 'Heading'},
    level: {label: 'Level', options: ['1', '2', '3', '4', '5', '6'], initial: '2'}
  };

  static render({text, level}, slots, element) {
    return element('h' + level, text);
  }
}

export class Paragraph extends TruncusBlock {
  static label = 'Paragraph';
  static fields = {
    text: {inline: true, rich: true, label: 'Text', initial: 'Paragraph text', kind: 'multiline'}
  };

  static render({text}, slots, element) {
    return element('p', text);
  }
}

/** Used both on its own and as a child in teasers and repeated link collections. */
export class Link extends TruncusBlock {
  static label = 'Link';
  static fields = {
    text: {inline: true, label: 'Link text', initial: 'Read more'},
    href: {label: 'Destination', kind: 'url', initial: '#'}
  };

  static render({text, href}, slots, element) {
    const link = element('a', text);
    if (safeUrl(href)) link.setAttribute('href', href);
    return link;
  }
}
