import './blocks.js';
import {registerPageType} from './page-types.js';

registerPageType('guide', {
  label: 'Guide',
  requiredLast: 'link-list',
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
