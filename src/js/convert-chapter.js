const path = require('path');
const yaml = require('js-yaml');
const cheerio = require('cheerio');
const Turndown = require('turndown');

const turndownService = new Turndown({
  headingStyle: 'atx',
});

const replaceElements = (text, elements) => {
  const $ = cheerio.load(text);
  const meta = {};

  if (isNonEmptyString(elements, 'remove')) {
    removeElements($, elements.remove);
  }

  if (isNonEmptyString(elements, 'title')) {
    meta.title = getTitle($, elements.title);
    removeTitle($, elements.title);
  }

  if (isNonEmptyString(elements, 'subtitle')) {
    meta.subtitle = getTitle($, elements.subtitle);
    removeTitle($, elements.subtitle);
  }

  ['h2', 'h3', 'h4', 'hr', 'br', 'blockquote', 'figure'].forEach(el => {
    if (isNonEmptyString(elements, el)) {
      replaceTagName($, elements[el], el);
    }
  });

  ['em', 'strong'].forEach(el => {
    if (isNonEmptyString(elements, el)) {
      wrapElContent($, elements[el], el);
    }
  });

  if (isNonEmptyString(elements, 'brBefore')) {
    insertElBefore($, elements.brBefore, 'br');
  }

  if (isNonEmptyString(elements, 'brAfter')) {
    insertElAfter($, elements.brAfter, 'br');
  }

  if (isNonEmptyString(elements, 'hrBefore')) {
    insertElBefore($, elements.hrBefore, 'hr');
  }

  if (isNonEmptyString(elements, 'hrAfter')) {
    insertElAfter($, elements.hrAfter, 'hr');
  }

  return { text: $('body').html(), meta };
};

const isNonEmptyString = (elements, element) => {
  return elements && typeof elements[element] === 'string' && elements[element].trim() != '';
};

const replaceTagName = ($, classes, tagName) => {
  $(getClassSelector(classes))
    .toArray()
    .forEach(el => (el.tagName = tagName));
};

const insertElBefore = ($, classes, tagName) => {
  $(`<${tagName}>`).insertBefore($(getClassSelector(classes)));
};

const insertElAfter = ($, classes, tagName) => {
  $(`<${tagName}>`).insertAfter($(getClassSelector(classes)));
};

const wrapElContent = ($, classes, tagName) => {
  $(getClassSelector(classes)).wrapInner(`<${tagName}></${tagName}>`);
};

const getTitle = ($, classes) => $(getClassSelector(classes)).first().text();

const removeTitle = ($, classes) => $(getClassSelector(classes)).first().remove();

const removeElements = ($, classes) => $(getClassSelector(classes)).remove();

const getClassSelector = classes =>
  classes
    .trim()
    .split(/\s+/)
    .map(className => `.${className.trim()}`)
    .join(', ');

const replaceResourceLinks = (text, resources) => {
  return resources.reduce((acc, res) => {
    const pattern = '\\([^\\s\\(]+(' + path.parse(res).base + ')\\)';
    return acc.replace(new RegExp(pattern, 'g'), '(./resources/$1)');
  }, text);
};

const convertChapter = (chapter, params, resources) => {
  const { text, meta } =
    params.params && params.params.elements
      ? replaceElements(chapter.text, params.params.elements)
      : { text: chapter.text, meta: {} };

  // turn to md
  const md = turndownService.turndown(text);

  const frontMatter = yaml.dump(meta);

  // replace resource uris
  const withResources = replaceResourceLinks(md, resources);

  return `---\n${frontMatter.trim()}\n---\n\n${withResources}\n`;
};

module.exports = { getTitle, convertChapter };
