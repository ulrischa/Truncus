import {register} from './model.js';
import {Heading, Paragraph, Link} from './blocks/text.js';
import {Repeater, LinkRepeater, LinkList, OrderedList, ListContent} from './blocks/lists.js';
import {AccordionItem, Accordion, Teaser} from './blocks/sections.js';

// These keys are part of the version 1 storage format. Registration order is
// also the display order for slots that accept every registered block type.
register('heading', Heading);
register('paragraph', Paragraph);
register('link', Link);
register('repeater', Repeater);
register('link-repeater', LinkRepeater);
register('link-list', LinkList);
register('accordion-item', AccordionItem);
register('accordion', Accordion);
register('teaser', Teaser);
register('ordered-list', OrderedList);
register('list-content', ListContent);
