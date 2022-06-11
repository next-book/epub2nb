const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const cheerio = require('cheerio');
const Turndown = require('turndown');

const PKG_DIR = path.join(__dirname, '../../');

const buildElements = classes =>
  Object.entries(classes).reduce((acc, entry) => {
    const [key, value] = entry;
    acc[key] = value.join('\n');
    return acc;
  }, {});

const defaultElements = buildElements(
  JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'default-classes.json'), 'utf8'))
);

const turndownService = new Turndown({
  headingStyle: 'atx',
});

turndownService
  .addRule('centered', {
    filter: ['centered'],
    replacement: content => '\n\n<div class="centered">\n\n' + content + '\n\n</div>\n\n',
  })
  .addRule('verse', {
    filter: ['verse'],
    replacement: content => '\n\n<div class="verse">\n\n' + content + '\n\n</div>\n\n',
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
    removeFirst($, classes.title);
  }

  if (classes.subtitle) {
    meta.subtitle = getTitle($, classes.subtitle);
    removeFirst($, classes.subtitle);
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

  if (classes.centered) {
    wrapEl($, classes.centered, 'centered');
  }

  if (classes.verse) {
    wrapEl($, classes.centered, 'verse');
  }

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

const wrapEl = ($, classes, tagName) => {
  $(classes).wrap(`<${tagName}></${tagName}>`);
};

const getTitle = ($, classes) => {
  const text = $(classes).first().text();
  return text.replace(/\n|\r/g, ' ').replace(/\./g, '\\.');
};

const removeFirst = ($, classes) => $(classes).first().remove();

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

const replaceFootnotes = mdText => {
  // format example
  // [94](#footnote-19288-94-backlink)
  // [94](#footnote-19288-94)
  return mdText
    .replace(/\n\[(\d+)\]\(#footnote-[^\)]+?-backlink\) ?/g, '\n[^$1]: ')
    .replace(/\[(\d+)\]\(#footnote-[^\)]+?\)/g, '[^$1]');
};

const applyFilters = (text, filters) => {
  let result = text;

  filters.forEach(f => {
    if (f.find === '' || f.find === null || f.find === undefined) return;
    const find = `${f.find}`;

    if (f.regex) {
      result = result.replace(new RegExp(`${find}`, 'g'), f.replace);
    } else {
      result = result.replace(
        new RegExp(`${find.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}`, 'g'),
        f.replace
      );
    }
  });

  return result;
};

const br2Section = md =>
  md.trim().length === 0
    ? ''
    : `<section>\n\n${md
        .trim()
        .replace(/\n\n  \n\n[\n ]+/, '\n\n  \n\n')
        .replace(/\n\n  \n\n/g, '\n\n</section>\n\n<section>\n\n')}\n\n</section>`;

const tooManyNbsps = md => md.replace(/ {12,}/g, ' '.repeat(12));

const clearNewlines = md => md.replace(/\n\n+/g, '\n\n').trim();

const nbsp2Br = html => html.replace(/<p>&nbsp;<\/p>/g, '<br>');

const convertChapter = (chapter, params, hiddenTitles, resources) => {
  const { text, meta } =
    params.params && params.params.elements
      ? replaceElements(chapter.text, params.params.elements, params.epub.classes)
      : replaceElements(chapter.text, defaultElements, []);

  // turn to md
  const md = clearNewlines(tooManyNbsps(br2Section(turndownService.turndown(nbsp2Br(text)))));

  const withFootnotes = replaceFootnotes(md);

  if (hiddenTitles.includes(chapter.out)) meta.hiddenTitle = true;

  const frontMatter = yaml.dump({
    ...meta,
    contentType: params?.params?.metadata?.contentType || 'prose',
  });

  // replace resource uris
  const withResources = updateResourceLinksByFilename(withFootnotes, resources);

  // apply find & replace filters
  const rs = params?.params?.replacements;
  const filtered = rs && rs.length > 0 ? applyFilters(withResources, rs) : withResources;

  return `---\n${frontMatter.trim()}\n---\n\n${filtered}\n`;
};

module.exports = { getTitle, convertChapter, createSelectors };
