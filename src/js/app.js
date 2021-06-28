const fs = require('fs');
const find = require('find');
const path = require('path');
const fsExtra = require('fs-extra');
const cheerio = require('cheerio');

const analyze = require('./analyze');
const convertChapter = require('./convert-chapter');
const epub2readium = require('./epub2readium');

const PKG_DIR = path.join(__dirname, '../../');

const convertBook = (dir, github) => {
  const { readiumDir, nbDir } = prepDirs(dir);

  const epub = findEpub(dir);

  if (epub === null) {
    return;
  }

  epub2readium(epub, readiumDir, () => {
    const manifest = loadManifest(readiumDir);
    const chapters = loadChapters(readiumDir, manifest);
    const params = loadParams(dir);

    chapters.forEach(chapter => {
      const text = convertChapter(chapter, params);
      fs.writeFileSync(path.join(nbDir, chapter.out), text);
    });

    writeParams(getParamsPath(dir), params, manifest, chapters, github);

    copyEditorFiles(dir);
  });
};

function copyEditorFiles(dir) {
  fs.copyFileSync(path.join(PKG_DIR, 'editor/index.html'), path.join(dir, 'index.html'));
  fsExtra.copySync(path.join(PKG_DIR, 'editor/assets'), path.join(dir, 'assets'));
}

function getParamsPath(dir) {
  return path.join(dir, 'params.json');
}

function loadParams(dir) {
  const path = getParamsPath(dir);
  return fs.existsSync(path) ? fs.readFileSync(path) : {};
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

function writeParams(paramsFile, params, manifest, chapters, github) {
  const allClasses = compileClasses(chapters);

  fs.writeFileSync(
    paramsFile,
    JSON.stringify(
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
            title: chapter.dom('h1, p').first().text(),
            filename: chapter.out,
            xhtml: path.parse(chapter.src).name + path.parse(chapter.src).ext,
          })),
          resources: manifest.resources,
          classes: allClasses,
          github: getGhData(github),
        },
      },
      null,
      2
    )
  );
}

function prepDirs(dir) {
  const readiumDir = path.join(dir, 'readium');
  const nbDir = path.join(dir, 'content');

  if (fs.existsSync(readiumDir)) fsExtra.removeSync(readiumDir);
  fs.mkdirSync(readiumDir);

  if (fs.existsSync(nbDir)) fsExtra.removeSync(nbDir);
  fs.mkdirSync(nbDir);

  return { readiumDir, nbDir };
}

const loadChapters = (readiumDir, manifest) => {
  return manifest.readingOrder.map(fileinfo => {
    const src = path.join(readiumDir, fileinfo.href);
    const out = path.parse(fileinfo.href).name + '.md';
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
