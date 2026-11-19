import './blocks.js';
import {registerPageType} from './page-types.js';

registerPageType('guide', {
  label: 'Guide',
  requiredLast: 'link-list',
  fieldHints: {heading: {level: 'The page template provides H1. Choose a level from H2 to H6.'}},
  fieldOptions: {heading: {level: ['2', '3', '4', '5', '6']}}
});

// A different layout built entirely through the same public API.
registerPageType('feature', {
  label: 'Feature article',
  regions: [
    {name: 'lead', accept: ['teaser'], min: 1, max: 1, initial: ['teaser']},
    {name: 'story', accept: ['heading', 'paragraph', 'accordion'], initial: ['paragraph']},
    {name: 'references', accept: ['link-list'], max: 2}
  ]
});

registerPageType('topic', {
  label: 'Topic page',
  slots: {
    intro: {label: 'Introduction', accept: ['heading', 'paragraph'], initial: ['heading']},
    body: {label: 'Main text', initial: ['paragraph']},
    resources: {label: 'Further information', accept: ['link-list'], max: 1}
  },
  rules: [{
    id: 'link-destination', scope: 'block', phase: 'publish',
    check({block}) {
      if (block.type === 'link' && (!block.attributes.href.trim() || block.attributes.href === '#')) {
        return {field: 'href', message: 'Enter a destination for “' + block.attributes.text + '”.'};
      }
    }
  }]
});
