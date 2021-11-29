const path = require('path');
const yaml = require('js-yaml');
const cheerio = require('cheerio');
const Turndown = require('turndown');

const turndownService = new Turndown({
  headingStyle: 'atx',
});

const replaceElements = (text, elements, allClasses) => {
  const classes = createSelectors(elements, allClasses);

  const $ = cheerio.load(text);
  const meta = {};

  if (classes.remove) {
    removeElements($, classes.remove);
  }

  if (classes.title) {
    meta.title = getTitle($, classes.title);
    removeTitle($, classes.title);
  }

  if (classes.subtitle) {
    meta.subtitle = getTitle($, classes.subtitle);
    removeTitle($, classes.subtitle);
  }

  ['h2', 'h3', 'h4', 'hr', 'br', 'blockquote', 'figure'].forEach(el => {
    if (classes[el]) {
      replaceTagName($, classes[el], el);
    }
  });

  ['em', 'strong'].forEach(el => {
    if (classes[el]) {
      wrapElContent($, classes[el], el);
    }
  });

  if (classes.brBefore) {
    insertElBefore($, classes.brBefore, 'br');
  }

  if (classes.brAfter) {
    insertElAfter($, classes.brAfter, 'br');
  }

  if (classes.hrBefore) {
    insertElBefore($, classes.hrBefore, 'hr');
  }

  if (classes.hrAfter) {
    insertElAfter($, classes.hrAfter, 'hr');
  }

  return { text: $('body').html(), meta };
};

const createSelectors = (defs, allClasses) => {
  const selectors = {};

  Object.keys(defs).map(key => {
    if (!(typeof defs[key] === 'string' && defs[key].trim() != '')) {
      selectors[key] = null;
      return;
    }

    selectors[key] = defs[key]
      .trim()
      .split(/\s+/)
      .map(token => token.trim())
      .map(token => allClasses.filter(c => c.match(new RegExp(`^${token}$`))))
      .reduce((acc, classList) => {
        return acc.concat(classList);
      }, [])
      .map(c => `.${c}`)
      .join(', ');
  });

  return selectors;
};

const replaceTagName = ($, classes, tagName) => {
  $(classes)
    .toArray()
    .forEach(el => (el.tagName = tagName));
};

const insertElBefore = ($, classes, tagName) => {
  $(`<${tagName}>`).insertBefore($(classes));
};

const insertElAfter = ($, classes, tagName) => {
  $(`<${tagName}>`).insertAfter($(classes));
};

const wrapElContent = ($, classes, tagName) => {
  $(classes).wrapInner(`<${tagName}></${tagName}>`);
};

const getTitle = ($, classes) => $(classes).first().text();

const removeTitle = ($, classes) => $(classes).first().remove();

const removeElements = ($, classes) => $(classes).remove();

const getClassSelector = classes =>
  classes
    .trim()
    .split(/\s+/)
    .map(className => `.${className.trim()}`)
    .join(', ');

/**
 * Uses just filename for matching. If there are multiple files
 * with the same name in various folders, this method does not work.
 */
const updateResourceLinksByFilename = (text, resources) => {
  const links = [...text.matchAll(/\[.+?\]\((.+?)\)/g)]
    .map(link => ({
      link: link[1],
      decoded: decodeURI(link[1]),
      base: path.parse(decodeURI(link[1])).base,
    }))
    .filter(link => !link.decoded.match(/^#/) && !link.decoded.match(/^https?:\/\//));

  const replacements = resources.reduce((acc, res) => {
    acc[path.parse(res.src).base] = res.out;
    return acc;
  }, {});

  return links.reduce(
    (acc, l) => acc.replace(l.link, `./resources/${encodeURI(replacements[l.base])}`),
    text
  );
};

const convertChapter = (chapter, params, resources) => {
const convertChapter = (chapter, params, hiddenTitles, resources) => {
  const { text, meta } =
    params.params && params.params.elements
      ? replaceElements(chapter.text, params.params.elements, params.epub.classes)
      : { text: chapter.text, meta: {} };

  // turn to md
  const md = turndownService.turndown(text);

  if (hiddenTitles.includes(chapter.out)) meta.hiddenTitle = true;
  const frontMatter = yaml.dump(meta);

  // replace resource uris
  const withResources = updateResourceLinksByFilename(md, resources);

  return `---\n${frontMatter.trim()}\n---\n\n${withResources}\n`;
};

module.exports = { getTitle, convertChapter, createSelectors };
