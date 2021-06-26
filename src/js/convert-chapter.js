const fs = require('fs');

const Turndown = require('turndown');

const turndownService = new Turndown({
  headingStyle: 'atx',
});

const convertChapter = (chapter, options) => {
  const titleLookup = chapter.text.match(
    /<p[^>]+class="[^>]*MLP_uroven2_kapitola[^>]*">(.+?)<\/p>/
  );

  const title = titleLookup !== null && titleLookup[1] !== null ? titleLookup[1] : '';

  const text = chapter.text
    .replace(/<p[^>]+class="[^>]*MLP_uroven3_nadpis[^>]*">(.+?)<\/p>/g, '<h2>$1</h2>')
    .replace(/<span[^>]+class="[^>]*kurziva[^>]*">(.+?)<\/span>/g, '<em>$1</em>')
    .replace(/<p[^>]+class="[^>]*MLP_uroven2_kapitola[^>]*">(.+?)<\/p>/, '')
    .replace(/<title>(.+?)<\/title>/, '');

  const md = turndownService.turndown(text);

  return (
    `---\ntitle: "${turndownService
      .turndown(title)
      .replace(/\n/g, '\\n')
      .replace(/"/g, '\\"')}"\n---\n\n` +
    md
      .replace(/\[\d+\]\([^#\)]+#footnote-(\d+)-backlink\)/g, '\n[^$1]: ')
      .replace(/\[\d+\]\([^#\)]+#footnote-(\d+)\)/g, '[^$1]')
      .replace(/([^\.]{11,}\S[\.\!\?“]) ([^ ][^\n])/g, '$1\n$2')
  );
};

module.exports = convertChapter;
