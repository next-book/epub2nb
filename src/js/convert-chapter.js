const path = require('path');
const yaml = require('js-yaml');
const cheerio = require('cheerio');
const Turndown = require('turndown');

const turndownService = new Turndown({
  headingStyle: 'atx',
});

const replaceElements = (text, elements) => {
  const $ = cheerio.load(text);

  const title = $('.MLP-uroven1-cast').first().text();
  $('.MLP-uroven1-cast').remove();

  return { text: $('body').html(), title };
};

const replaceResourceLinks = (text, resources) => {
  return resources.reduce((acc, res) => {
    const pattern = '\\([^\\s\\(]+(' + path.parse(res).base + ')\\)';
    return acc.replace(new RegExp(pattern, 'g'), '(./resources/$1)');
  }, text);
};

const convertChapter = (chapter, params, resources) => {
  const { text, title } = replaceElements(chapter.text, params.elements);

  // turn to md
  const md = turndownService.turndown(text);

  const frontMatter = yaml.dump({
    title,
  });

  // replace resource uris
  const withResources = replaceResourceLinks(md, resources);

  return `---\n${frontMatter}\n---\n\n${withResources}\n`;
};

module.exports = convertChapter;
