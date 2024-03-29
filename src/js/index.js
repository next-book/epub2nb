const fs = require('fs');
const find = require('find');
const path = require('path');
const fsExtra = require('fs-extra');
const cheerio = require('cheerio');
const yaml = require('js-yaml');
const fm = require('front-matter');
const slugify = require('slugify');
const https = require('https');

const analyze = require('./analyze');
const { convertChapter, getTitle, createSelectors } = require('./convert-chapter');
const epub2readium = require('./epub2readium');

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

const about = [];

const convertBook = (dir, github) => {
  const { readiumDir, nbDir, resourcesDir } = prepDirs(dir);

  const epub = findEpub(dir);

  if (epub === null) {
    return;
  }

  epub2readium(epub, readiumDir, async () => {
    const manifest = loadManifest(readiumDir);
    const chapters = loadChapters(readiumDir, manifest);
    const paramsOrig = loadParams(dir);
    const resources = [];
    const params = compileParams(paramsOrig, manifest, chapters, github);

    manifest.resources.forEach(res => {
      if (res.type.match(/image/)) {
        const name = slugify(path.parse(res.href).base, { lower: true });

        fs.copyFileSync(path.join(readiumDir, res.href), path.join(resourcesDir, name));

        resources.push({ src: res.href, out: name });
      }
    });

    const hiddenTitles = params.params ? getHiddenTitleFilenames(params.params.structure) : [];

    const globalFootnotesObj = { current: null };
    const globalFootnotesIndex = chapters.findIndex(c =>
      /Poznámky pod čarou<\/h[12]>/.test(c.text)
    );

    if (globalFootnotesIndex !== -1) {
      globalFootnotesObj.current = convertChapter(
        chapters[globalFootnotesIndex],
        params,
        hiddenTitles,
        resources
      )
        .split('\n---\n')[1]
        .replace(/<\/?section>/g, '')
        .replace(/\n\[\^(\d+)\]/g, '\n[^$1]:')
        .trim();
    }

    const chapterTexts = chapters.reduce((acc, chapter, index) => {
      acc[chapter.out] = convertChapter(
        chapter,
        params,
        hiddenTitles,
        resources,
        globalFootnotesObj.current
      );
      return acc;
    }, {});

    saveChapters(chapterTexts, params.params ? params.params.structure : [], nbDir, 0);
    fs.writeFileSync(
      path.join(nbDir, 'about.md'),
      prepAbout(about, params?.params?.metadata?.isbn, github)
    );
    fs.writeFileSync(getParamsPath(dir), JSON.stringify(params, null, 2));
    copyEditorFiles(dir);

    const { structure } = params?.params;
    if (structure && !promoExists(structure)) {
      const promo = await getPromoData();
      structure.unshift({ role: 'promo' });
      if (promo !== null) fs.writeFileSync(path.join(nbDir, 'promo.md'), promo);
    }

    const bookFileText = createBookFile(params.params.metadata, structure, chapterTexts);
    fs.writeFileSync(path.join(nbDir, '_book.md'), bookFileText);
  });
};

function createBookFile(metadata, structure, chapterTexts) {
  const frontMatter = yaml.dump({
    outputs: 'meta',
    slug: 'book',
    contentType: 'prose',
    languageCode: metadata?.languageCode || 'en',
    meta: metadata,
    readingOrder: getReadingOrder(structure || [], 0),
    tocBase: structure ? assembleTocBase(structure) : null,
    static: [
      'style',
      'scripts',
      'title',
      'fonts',
      'resources',
      'template-images',
      'assets',
      'favicon.png',
    ],
  });

  return `---\n${frontMatter.trim()}\n---\n`;
}

function getHiddenTitleFilenames(structure) {
  const filenames = [];

  return structure.reduce((acc, chapter) => {
    if (chapter.hiddenTitle) acc.push(chapter.filename);
    if (chapter.children && chapter.children.length > 0)
      acc = [...acc, ...getHiddenTitleFilenames(chapter.children)];
    return acc;
  }, []);
}

function promoExists(structure) {
  return structure.some(chapter => {
    if (chapter.role === 'promo') return true;

    if (chapter.children?.length) return promoExists(chapter.children);

    return false;
  });
}

function assembleTocBase(structure) {
  return structure
    .filter(
      chapter =>
        (chapter.isSection && chapter.children && chapter.children.length > 0) ||
        (chapter.inToc && chapter.title && (chapter.role === 'chapter' || chapter.role === 'break'))
    )
    .map(assembleTocItem);
}

function assembleTocItem(chapter) {
  if (chapter.isSection)
    return {
      id: chapter.id,
      children: assembleTocBase(chapter.children),
      isSection: true,
      listType: chapter.listType,
    };

  const item = {
    link: chapter.filename.replace(/.md$/, '.html'),
    title: chapter.title,
    hiddenTitle: chapter.hiddenTitle,
  };

  if (chapter.children && chapter.children.length > 0) {
    item.children = assembleTocBase(chapter.children);
    item.listType = chapter.listType;
  }

  return item;
}

function replaceExt(filename) {
  return filename.replace(/.md$/, '.html');
}

function getReadingOrder(structure) {
  let about = null;

  function extractFilenames(structureLevel, lvl) {
    return structureLevel.reduce((acc, chapter, index) => {
      if (chapter.role === 'remove' || chapter.role === 'cover' || chapter.devoured) {
        return acc;
      } else if (chapter.role === 'promo') {
        acc.push(replaceExt('promo.md'));
      } else if (chapter.role === 'about') {
        about = 'about.html';
        return acc;
      } else if (!chapter.isSection) {
        acc.push(replaceExt(chapter.filename));
      }

      if (chapter.children && chapter.children.length > 0) {
        acc.push(...extractFilenames(chapter.children, lvl + 1));
      }

      return acc;
    }, []);
  }

  const readingOrder = extractFilenames(structure, 0);
  if (about) readingOrder.push(about);

  return readingOrder;
}

function saveChapters(chapterTexts, structure, nbDir, level) {
  let hungry = null;

  structure.forEach(async (chapter, index) => {
    if (chapter.role === 'remove') {
      return;
    } else if (chapter.role === 'about') {
      about.push(chapterTexts[chapter.filename]);
    } else if (chapter.role === 'promo') {
      const promo = await getPromoData();
      if (promo !== null) fs.writeFileSync(path.join(nbDir, 'promo.md'), promo);
    } else if (chapter.role === 'cover') {
      fs.writeFileSync(path.join(nbDir, '_index.md'), chapterTexts[chapter.filename]);
      saveSubchapters(chapterTexts, chapter, nbDir, level);
    } else if (chapter.isSection) {
      saveSubchapters(chapterTexts, chapter, nbDir, level);
    } else if (chapter.hungry) {
      fs.writeFileSync(path.join(nbDir, chapter.filename), chapterTexts[chapter.filename]);
      hungry = {
        filename: path.join(nbDir, chapter.filename),
        text: chapterTexts[chapter.filename],
      };
    } else if (chapter.devoured) {
      hungry.text =
        hungry.text.replace(/\n\[\^1\]:[\s\S]+$/, '') +
        '\n\n' +
        removeFrontMatter(chapterTexts[chapter.filename]).trim();
      fs.writeFileSync(hungry.filename, hungry.text + '\n');
    } else {
      fs.writeFileSync(path.join(nbDir, chapter.filename), chapterTexts[chapter.filename]);
      saveSubchapters(chapterTexts, chapter, nbDir, level);
    }
  });
}

async function getPromoData() {
  const promoBaseUrl = 'https://books-are-next.github.io/mkp-promo/';
  let json = '';

  return new Promise(resolve => {
    https
      .get(path.join(promoBaseUrl, 'promo.json'), function (res) {
        res.on('data', function (chunk) {
          json += chunk;
        });
        res.on('end', function () {
          if (res.statusCode === 200) {
            try {
              const promo = JSON.parse(json);
              resolve(promo ? `---\n${yaml.dump({ title: promo.publisher, promo })}\n---\n` : null);
            } catch (e) {
              console.log('Error parsing promo JSON!');
              resolve(null);
            }
          } else {
            console.log('Status:', res.statusCode);
          }
        });
      })
      .on('error', function (err) {
        console.log('Error:', err);
      });
  });
}

function removeFrontMatter(mdContent) {
  return mdContent.replace(/^[\s\S]+?\n---\n/, '');
}

function prepAbout(about, isbn, github) {
  const text = about
    .map(chapter => fm(chapter))
    .map(data =>
      data.attributes.title ? `## ${data.attributes.title}\n\n${data.body}` : `***\n\n${data.body}`
    )
    .join('\n\n');

  const dumbAbout = dumbifyAbout(text, isbn, github);

  return `---\ntitle: Tiráž\n---\n\n${dumbAbout}`;
}

function dumbifyAbout(text, isbn, github) {
  const tacr =
    'Vydání webové knihy podpořila [Technologická agentura ČR](https://www.tacr.cz/) v projektu ' +
    '[Redesign knihovních služeb 2020: webové knihy](https://starfos.tacr.cz/cs/project/TL04000391).';

  const categories = {
    main: [],
    origin: [],
    license: [],
    dedication: [],
    bib: [],
    quote: [],
    other: [],
  };

  const pubNumberRef = { current: null };

  `\n${text}\n`
    .replace(/<\/?section>/g, '')
    .replace(/\n\* \* \*\n/g, '\n***\n')
    .split('\n***\n')
    .map(part => part.trim().replace(/[\n\r]{2,}/g, '\n\n'))
    .filter(part => part)
    .forEach(part => {
      [
        [/Edice|Redakce|Překlad|Vydala/, 'main'],
        [/^Znění/, 'origin'],
        [/není vázán|je vázán|jsou vázány|Vydání \(obálka/, 'license'],
        [/Citační záznam/, 'bib'],
        [/věnuji|věnován/, 'dedication'],
        [/^_/, 'quote'],
        [/.+/, 'other'],
      ].some(pair => {
        const [regex, c] = pair;
        const ghInfo = getGhData(github);

        if (regex.test(part)) {
          if (c === 'main') {
            const pubNumber = part.match(/(\d+)\.\s+(opravené|elektronické\s+)?vydání/);

            const filtered = part
              .replace(/(\n\s+)+/g, '\n')
              .split(/\n/)
              .filter(
                line =>
                  !/\d\.\s+(opravené|elektronické\s+)?vydání|^Verze|ISBN|na obálce|^Návrh obálky|^Ilustrace /.test(
                    line
                  )
              );

            if (isbn) filtered.push(`ISBN ${isbn} (webová kniha)`);

            const d = new Date();
            pubNumberRef.current = `V MKP ${
              pubNumber?.[1] ? parseInt(pubNumber[1], 10) + 1 : 1
            }\. elektronické vydání z ${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.`;
            filtered.push(pubNumberRef.current);

            categories[c].push(filtered.join('  \n'));
          } else if (c === 'bib') {
            const d = new Date();
            const filtered = part
              .replace(
                /\[aktuální datum citace[^\]]+\]/,
                `[cit. ${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}]`
              )
              .replace(/V\sMKP\s(\d+)\.\svyd\./g, 'pubNumber')
              .replace(
                /Dostupné z[\s\S]+$/,
                ghInfo?.repo
                  ? `Dostupné z <[${ghInfo.user}.github.io/${ghInfo.repo}](https://${ghInfo.user}.github.io/${ghInfo.repo}/)>.`
                  : ''
              )

              .split(/\. /);

            categories[c].push(filtered.join('. '));
          } else
            categories[c].push(
              part
                .split('\n')
                .filter(line => !/^Verze/.test(line))
                .filter(i => i)
                .join('\n')
            );

          return true;
        }
      });
    });

  const sep = '\n\n***\n\n';
  const j = catName => (categories[catName].length ? categories[catName].join('\n\n') : null);
  return (
    [
    j('main'),
    j('origin'),
    j('license'),
    j('dedication'),
    j('bib')
      ? j('bib').replace('pubNumber', pubNumberRef.current ? pubNumberRef.current : null)
      : null,
    j('quote'),
    tacr,
  ]
    .filter(x => x)
      .join(sep)
      // remove links and images
      .replace(/\[!\[\]\([^\)]+?\)\]\([^\)]+?\)/g, '')
      .replace(/!\[\]\([^\)]+?\)/g, '')
  );
}

function saveSubchapters(chapterTexts, structure, nbDir, level) {
  if (structure.children && structure.children.length > 0)
    saveChapters(chapterTexts, structure.children, nbDir, level + 1);
}

function copyEditorFiles(dir) {
  fs.copyFileSync(path.join(PKG_DIR, 'editor/index.html'), path.join(dir, 'index.html'));
  fsExtra.copySync(path.join(PKG_DIR, 'editor/assets'), path.join(dir, 'assets'));
  fs.copyFileSync(
    path.join(PKG_DIR, 'default-classes.json'),
    path.join(dir, 'assets/default-classes.json')
  );
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
  const elements = (params && params.params && params.params.elements) || defaultElements;
  const selectors = elements ? createSelectors(elements, allClasses) : [];

  const epub = {
    metadata: {
      title: manifest.metadata.title,
      identifier: manifest.metadata.identifier,
      author: manifest.metadata.author,
      publisher: manifest.metadata.publisher,
      modified: manifest.metadata.modified,
      publisherShort: manifest.metadata.publisherShort,
      edition: manifest.metadata.edition,
      languageCode: manifest.metadata.languageCode,
      yearPublished: manifest.metadata.yearPublished,
    },
    chapters: chapters.map(chapter => ({
      titleSuggest: selectors.title !== null ? getTitle(chapter.dom, selectors.title) : '',
      subtitleSuggest: selectors.subtitle !== null ? getTitle(chapter.dom, selectors.subtitle) : '',
      filename: chapter.out,
      xhtml: path.parse(chapter.src).name + path.parse(chapter.src).ext,
    })),
    resources: manifest.resources,
    classes: allClasses,
    github: getGhData(github),
    generatedAt: Date.now(),
  };

  return {
    params: {
      metadata: params.params?.metadata || {
        title: manifest.metadata.title,
        identifier: manifest.metadata.identifier,
        author: manifest.metadata.author,
        publisher: manifest.metadata.publisher,
        modified: manifest.metadata.modified,
        publisherShort: manifest.metadata.publisherShort,
        edition: manifest.metadata.edition,
        languageCode: manifest.metadata.languageCode,
        yearPublished: manifest.metadata.yearPublished,
      },
      elements: params.params?.elements || defaultElements,
      structure: prepStructure(params.params?.structure, chapters),
    },
    epub,
  };
}

function prepStructure(structure, chapters) {
  return structure ? addRootSection(structure) : baseStructureOnReadingOrder(chapters);
}

function addRootSection(structure) {
  return structure[0].isSection !== true
    ? [
        {
          isSection: true,
          id: 'section-1',
          children: structure,
        },
      ]
    : [...structure];
}

function baseStructureOnReadingOrder(chapters) {
  return [
    {
      isSection: true,
      id: 'section-1',
      children: chapters.map((chapter, index) => ({
        filename: chapter.out,
        xhtml: path.parse(chapter.src).name + path.parse(chapter.src).ext,
        title: chapter.title,
        id: index,
        role: 'chapter',
        listType: 'plain',
        inToc: true,
        hungry: false,
        devoured: false,
        hiddenTitle: false,
      })),
    },
  ];
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
  fs.writeFileSync(path.join(resourcesDir, 'index.md'), '---\nheadless: true\n---\n');

  return { readiumDir, nbDir, resourcesDir };
}

const loadChapters = (readiumDir, manifest) => {
  return manifest.readingOrder.map(fileinfo => {
    const src = path.join(readiumDir, fileinfo.href);
    const out = path.parse(fileinfo.href).name.replace(/\s+/g, '').toLowerCase() + '.md';
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
