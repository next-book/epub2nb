const fs = require('fs');
const find = require('find');
const path = require('path');
const fsExtra = require('fs-extra');
const cheerio = require('cheerio');
const yaml = require('js-yaml');
const fm = require('front-matter');

const analyze = require('./analyze');
const { convertChapter, getTitle } = require('./convert-chapter');
const epub2readium = require('./epub2readium');

const PKG_DIR = path.join(__dirname, '../../');

const convertBook = (dir, github) => {
  const { readiumDir, nbDir, resourcesDir } = prepDirs(dir);

  const epub = findEpub(dir);

  if (epub === null) {
    return;
  }

  epub2readium(epub, readiumDir, () => {
    const manifest = loadManifest(readiumDir);
    const chapters = loadChapters(readiumDir, manifest);
    const params = loadParams(dir);
    const resources = [];

    manifest.resources.forEach(res => {
      if (res.type.match(/image/)) {
        const name = path.parse(res.href).base;

        fs.copyFileSync(path.join(readiumDir, res.href), path.join(resourcesDir, name));

        resources.push(name);
      }
    });

    const chapterTexts = chapters.reduce((acc, chapter, index) => {
      acc[chapter.out] = convertChapter(chapter, params, resources);
      return acc;
    }, {});

    saveChapters(chapterTexts, params.params ? params.params.structure : [], nbDir, 0);

    const paramsData = compileParams(params, manifest, chapters, github);
    fs.writeFileSync(getParamsPath(dir), paramsData);

    copyEditorFiles(dir);

    const bookFileText = createBookFile(params.params, chapterTexts);
    fs.writeFileSync(path.join(nbDir, '_book.md'), bookFileText);
  });
};

function createBookFile(params, chapterTexts) {
  const frontMatter = yaml.dump({
    outputs: 'meta',
    slug: 'book',
    languageCode: params && params.metadata ? params.metadata.languageCode : 'en',
    meta: params && params.metadata,
    chapters: getChapterTitles(params ? params.structure : [], 0),
    tocBase: params && params.structure ? assembleTocBase(params.structure) : null,
    static: ['style', 'scripts', 'title', 'fonts', 'resources', 'favicon.png'],
  });

  return `---\n${frontMatter.trim()}\n---\n`;
}

function assembleTocBase(structure) {
  return structure
    .filter(
      chapter =>
        chapter.inToc && chapter.title && (chapter.role === 'chapter' || chapter.role === 'break')
    )
    .map(assembleTocItem);
}

function assembleTocItem(chapter) {
  const item = {
    link: chapter.filename.replace(/.md$/, '.html'),
    title: chapter.title,
  };

  if (item.children && item.children.length > 0) {
    item.children = assembleTocBase(item.children);
    item.numberedChildren = item.numberedChildren;
  }

  return item;
}

function getChapterTitles(structure, level) {
  return structure.reduce((acc, chapter, index) => {
    if (
      chapter.role === 'remove' ||
      chapter.role === 'colophon' ||
      (chapter.role === 'cover' && index === 0)
    )
      return acc;
    else acc.push(chapter.filename.replace(/.md$/, '.html'));

    if (structure.children && structure.children.length > 0)
      acc.push(...getChapterTitles(structure.children, level + 1));

    return acc;
  }, []);
}

function saveChapters(chapterTexts, structure, nbDir, level) {
  const colophon = [];

  structure.forEach((chapter, index) => {
    if (chapter.role === 'remove') {
      return;
    } else if (chapter.role === 'colophon') {
      colophon.push(chapterTexts[chapter.filename]);
    } else if (chapter.role === 'cover' && index === 0) {
      fs.writeFileSync(path.join(nbDir, '_index.md'), chapterTexts[chapter.filename]);
      saveSubchapters(chapterTexts, chapter, nbDir, level);
    } else {
      fs.writeFileSync(path.join(nbDir, chapter.filename), chapterTexts[chapter.filename]);
      saveSubchapters(chapterTexts, chapter, nbDir, level);
    }
  });

  fs.writeFileSync(path.join(nbDir, 'colophon.md'), prepColophon(colophon));
}

function prepColophon(colophon) {
  const text = colophon
    .map(chapter => fm(chapter))
    .map(data =>
      data.attributes.title ? `## ${data.attributes.title}\n\n${data.body}` : `***\n\n${data.body}`
    )
    .join('\n\n');
  return `---\ntitle: Tiráž\n---\n\n${text}`;
}

function saveSubchapters(chapterTexts, structure, nbDir, level) {
  if (structure.children && structure.children.length > 0)
    saveChapters(chapterTexts, structure.children, nbDir, level + 1);
}

function copyEditorFiles(dir) {
  fs.copyFileSync(path.join(PKG_DIR, 'editor/index.html'), path.join(dir, 'index.html'));
  fsExtra.copySync(path.join(PKG_DIR, 'editor/assets'), path.join(dir, 'assets'));
}

function getParamsPath(dir) {
  return path.join(dir, 'params.json');
}

function loadParams(dir) {
  const path = getParamsPath(dir);
  return fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf-8')) : {};
}

function loadManifest(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
}

function getGhData(github) {
  if (!github || github.indexOf('/') < 1) return null;
  const [user, repo] = github.split('/');
  return {
    user,
    repo,
  };
}

function compileParams(params, manifest, chapters, github) {
  const allClasses = compileClasses(chapters);
  const elements = (params && params.params && params.params.elements) || null;

  return JSON.stringify(
    {
      params: params.params,
      epub: {
        metadata: {
          title: manifest.metadata.title,
          identifier: manifest.metadata.identifier,
          author: manifest.metadata.author,
          publisher: manifest.metadata.publisher,
          modified: manifest.metadata.modified,
        },
        chapters: chapters.map(chapter => ({
          titleSuggest:
            elements && elements.title.trim() ? getTitle(chapter.dom, elements.title) : '',
          subtitleSuggest:
            elements && elements.subtitle.trim() ? getTitle(chapter.dom, elements.subtitle) : '',
          filename: chapter.out,
          xhtml: path.parse(chapter.src).name + path.parse(chapter.src).ext,
        })),
        resources: manifest.resources,
        classes: allClasses,
        github: getGhData(github),
        generatedAt: Date.now(),
      },
    },
    null,
    2
  );
}

function prepDirs(dir) {
  const readiumDir = path.join(dir, 'readium');
  const nbDir = path.join(dir, 'content');
  const resourcesDir = path.join(dir, 'content/resources');

  if (fs.existsSync(readiumDir)) fsExtra.removeSync(readiumDir);
  fs.mkdirSync(readiumDir);

  if (fs.existsSync(nbDir)) fsExtra.removeSync(nbDir);
  fs.mkdirSync(nbDir);

  fs.mkdirSync(resourcesDir);
  fs.writeFileSync(path.join(resourcesDir, '_index.md'), '');

  return { readiumDir, nbDir, resourcesDir };
}

const loadChapters = (readiumDir, manifest) => {
  return manifest.readingOrder.map(fileinfo => {
    const src = path.join(readiumDir, fileinfo.href);
    const out = path.parse(fileinfo.href).name.replace(/\s+/g, '') + '.md';
    const text = fs.readFileSync(src, 'utf8');
    const dom = cheerio.load(text);
    const results = analyze(dom);

    return {
      src,
      out,
      text,
      dom,
      ...results,
    };
  });
};

const compileClasses = chapters => {
  const all = [];

  chapters.forEach(chapter => all.push(...chapter.classes));

  return all.filter((value, index, self) => self.indexOf(value) === index).sort();
};

const findEpub = dir => {
  const files = find.fileSync(/\.epub$/, dir);

  if (files.length > 1) console.log(`Found multiple EPUB files in "${dir}".`);

  if (files.length > 0) {
    console.log(`Converting "${files[0]}".`);
    return files[0];
  } else {
    console.log(`No EPUB found in the "${dir}" directory.`);
    return null;
  }
};

module.exports = { convertBook };
