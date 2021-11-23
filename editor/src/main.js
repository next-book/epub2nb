import Vue from 'vue';
import VueNestable from 'vue-nestable';
import { toCSS, toJSON } from 'cssjson';
import { html_beautify } from 'js-beautify';

import AutoComplete from './autocomplete';

Vue.use(VueNestable);
Vue.component('autocomplete', AutoComplete);

Vue.component('css-preview', {
  template: `<span>
    <span v-on:click="togglePreview" class="material-icons">visibility</span> {{ name }}
    <div class="css-preview" v-if="showPreview">

      <figure>
        <figcaption>Limited style preview</figcaption>
        <div class="preview-wrapper">
          <div :style="style.attributes">Style example.</div>

          <div><br>Style example <span :style="style.attributes">inside block</span>.</div>
        </div>
      </figure>

      <label>CSS rule:<br>
        <textarea rows="3" cols="40">{{ style.selector }} {
{{ style.attributes}}
}</textarea>
      </label>
    </div>
  </span>`,
  props: ['name', 'styles'],
  data: () => ({
    showPreview: false,
  }),
  methods: {
    togglePreview: function () {
      this.showPreview = !this.showPreview;
    },
  },
  computed: {
    style: function () {
      const selector = Object.keys(this.styles.children).find(sel =>
        sel.match(new RegExp(`\\.${this.name}`))
      );

      const attributes = Object.entries(this.styles.children[selector].attributes)
        .map(dec => `${dec[0]}: ${dec[1]}`)
        .join(';\n');

      return { selector, attributes };
    },
  },
});

Vue.component('html-preview', {
  data: function () {
    return { code: '' };
  },
  template: `<pre class="chapter-code">{{code}}</pre>`,
  mounted: function () {
    fetch(this.src).then(async response => {
      const code = await response.text();
      this.code = html_beautify(code);
    });
  },
  props: ['src'],
});

Vue.component('toc-specials', {
  template: `
    <ul>
      <li v-if="cover !== null">
        <span class="filename">{{cover.filename}}</span>
        <span class="title">Book cover</span>
      </li>

      <li v-for="item in colophon">
        <span class="filename">{{item.filename}}</span>
        <span class="title">Colophon (will be merged)</span>
      </li>
    </ul>
  `,
  methods: {
    findInStructure: function (items, role) {
      for (var i = 0; i <= items.length - 1; i++) {
        const item = items[i];

        if (item.role === role) return item;
        else if (item.children && item.children.length > 0) {
          const found = this.findInStructure(item.children, role);
          if (found !== null) return found;
        }
      }

      return null;
    },
    findAllInStructure: function (items, role) {
      const all = [];

      for (var i = 0; i <= items.length - 1; i++) {
        const item = items[i];

        if (item.role === role) all.push(item);

        if (item.children && item.children.length > 0) {
          const found = this.findAllInStructure(item.children, role);
          if (found.length > 0) all.push(...found);
        }
      }

      return all;
    },
  },
  computed: {
    cover: function () {
      return this.findInStructure(this.structure, 'cover');
    },
    colophon: function () {
      return this.findAllInStructure(this.structure, 'colophon');
    },
  },
  props: ['structure'],
});

Vue.component('toc-preview', {
  template: `
    <ol v-if="listType === 'numbered'">
      <toc-item v-for="(item, index) in items" :item="item" :key="item.filename"></toc-item>
    </ol>
    <ul v-else-if="listType === 'plain'" class="plain">
      <toc-item v-for="(item, index) in items" :item="item" :key="item.filename"></toc-item>
    </ul>
    <ul v-else>
      <toc-item v-for="(item, index) in items" :item="item" :key="item.filename"></toc-item>
    </ul>
  `,
  props: ['items', 'listType'],
});

Vue.component('toc-item', {
  template: `
    <li v-if="!item.isSection && item.title && item.role !== 'remove' && item.role !== 'colophon' && item.inToc && item.role !== 'cover'">
      <span class="filename">{{item.filename}}</span>
      <span class="title">{{item.title}}</span>
      <toc-preview v-if="item.children && item.children.length > 1" :items="item.children" :list-type="item.listType"></toc-preview>
    </li>
    <div v-else-if="item.isSection && item.children && item.children.length > 1">
      <toc-preview v-if="item.children && item.children.length > 1" :items="item.children" :list-type="item.listType"></toc-preview>
    </div>
  `,
  props: ['item'],
});

Vue.component('icon', {
  template: `
    <span v-if="role == 'cover'" class="material-icons">photo</span>
    <span v-else-if="role == 'chapter'" class="material-icons">subject</span>
    <span v-else-if="role == 'break'" class="material-icons">subtitles</span>
    <span v-else-if="role == 'colophon'" class="material-icons">copyright</span>
    <span v-else-if="role == 'remove'" class="material-icons">close</span>
    `,
  props: ['role'],
});

Vue.component('toc-item-edit-title', {
  template: `
    <li v-if="item.role !== 'remove'">
      <span v-if="item.isSection" class="filename">
        Section
      </span>

      <span v-if="!item.isSection" class="filename">
        <icon :role="item.role"></icon>
        <span class="material-icons" v-on:click="$emit('preview', item.xhtml)">visibility</span>
        {{item.filename}}
        <span v-on:click="toggleRemove" class="material-icons clickable">close</span>
      </span>


      <label v-if="!item.isSection" >
        <textarea type="text" v-model="item.title" cols="30" rows="2" placeholder="Title"></textarea>
        <span class="suggested-title" v-on:click="() => updateTitle()" v-if="suggestedTitles[item.filename]">{{suggestedTitles[item.filename]}}</span>
      </label>
      <label v-if="!item.isSection">
        <input type="checkbox" id="checkbox" v-model="item.hiddenTitle">
        TOC-only
      </label>

      <label v-if="!item.isSection" >
        <textarea type="text" v-model="item.subtitle" cols="30" rows="2" placeholder="Subtitle"></textarea>
        <span class="suggested-title" v-on:click="() => updateSubtitle()" v-if="suggestedSubtitles[item.filename]">{{suggestedSubtitles[item.filename]}}</span>
      </label>

      <div v-if="item.children && item.children.length">
        <ol v-if="item.listType === 'numbered'">
          <toc-item-edit-title v-for="item in item.children" :item="item" @updatetitle="filename => updateTitle(filename)" @updatesubtitle="updateSubtitle" :key="item.filename" @preview="filename => $emit('preview', filename)"></toc-item-edit-title>
        </ol>
        <ul v-else-if="item.listType === 'plain'" class="plain">
          <toc-item-edit-title v-for="item in item.children" :item="item" @updatetitle="filename => updateTitle(filename)" @updatesubtitle="updateSubtitle" :key="item.filename" @preview="filename => $emit('preview', filename)"></toc-item-edit-title>
        </ul>
        <ul v-else>
          <toc-item-edit-title v-for="item in item.children" :item="item" @updatetitle="filename => updateTitle(filename)" @updatesubtitle="updateSubtitle" :key="item.filename" @preview="filename => $emit('preview', filename)"></toc-item-edit-title>
        </ul>
      </div>
    </li>
  `,
  methods: {
    toggleRemove: function () {
      if (this.item.role === 'remove') this.item.role = 'chapter';
      else this.item.role = 'remove';
    },
    updateTitle: function (filename) {
      this.$emit('updatetitle', filename || this.item.filename);
    },
    updateSubtitle: function (filename) {
      this.$emit('updatesubtitle', filename || this.item.filename);
    },
  },
  computed: {
    suggestedTitles: function () {
      return this.epubChapters.reduce((acc, chapter) => {
        acc[chapter.filename] = chapter.titleSuggest;
        return acc;
      }, {});
    },
    suggestedSubtitles: function () {
      return this.epubChapters.reduce((acc, chapter) => {
        acc[chapter.filename] = chapter.subtitleSuggest;
        return acc;
      }, {});
    },
  },
  props: ['item'],
});

var elements = [
  { name: 'title', title: 'Extract chapter title (H1)' },
  { name: 'subtitle', title: 'Extract chapter subtitle' },
  { name: 'h2', title: 'Change to subheading 1 (H2)' },
  { name: 'h3', title: 'Change to subheading 2 (H3)' },
  { name: 'h4', title: 'Change to subheading 3 (H4)' },
  { name: 'hr', title: 'Change to as fleuron' },
  { name: 'hrBefore', title: 'Insert fleuron before' },
  { name: 'hrAfter', title: 'Insert fleuron after' },
  { name: 'br', title: 'Replace as spacer' },
  { name: 'brBefore', title: 'Insert spacer before' },
  { name: 'brAfter', title: 'Insert spacer after' },
  { name: 'blockquote', title: 'Change to block quote' },
  { name: 'figure', title: 'Change to figure' },
  { name: 'em', title: 'Emphasize inner content (italics)' },
  { name: 'strong', title: 'Strongly emphasize inner content (bold)' },
  { name: 'remove', title: 'Remove element from document' },
  { name: 'ignore', title: 'Ignore this class' },
];

function prepElObj(elements) {
  return elements.reduce((acc, el) => {
    acc[el.name] = '';
    return acc;
  }, {});
}

function prepStructure(chapters) {
  return [
    {
      isSection: true,
      id: 'section-1',
      children: chapters.map((chapter, index) => ({
        filename: chapter.filename,
        xhtml: chapter.xhtml,
        title: chapter.title,
        id: index,
        role: 'chapter',
        listType: 'plain',
        inToc: true,
      })),
    },
  ];
}

function loadCss(resources, setter) {
  const url = resources.find(res => res.type === 'text/css').href;

  return fetch(`readium/${url}`)
    .then(response => response.text())
    .then(text => {
      setter(toJSON(text));
    });
}

function upgradeStructure(items) {
  return items.map(item => {
    const updated = { ...item };
    if (item.listType === 'basic') updated.listType = 'plain';
    else updated.listType = item.numberedChildren ? 'numbered' : 'plain';

    delete updated['numberedChildren'];
    delete updated['children'];

    updated.children = upgradeStructure(item.children);

    return updated;
  });
}

fetch('./params.json')
  .then(response => response.json())
  .then(data => {
    Vue.prototype.epubChapters = (data.epub && data.epub.chapters) || [];

    var app = new Vue({
      el: '#app',
      data: {
        previewUrl: null,
        previewTab: 'preview',
        tab: 'metadata',
        elements,
        params:
          data.params && Object.keys(data.params).length
            ? {
                metadata: data.params.metadata,
                elements: { ...prepElObj(elements), ...data.params.elements },
                structure: upgradeStructure(data.params.structure),
              }
            : {
                metadata: data.epub.metadata,
                elements: prepElObj(elements),
                structure: prepStructure(data.epub.chapters),
              },
        epub: data.epub,
        css: '',
      },
      created: function (props) {
        loadCss(data.epub.resources, this.setCss);
      },
      methods: {
        setCss: function (css) {
          this.css = css;
        },
        navToStructure: function () {
          this.tab = 'structure';
        },
        navToMeta: function () {
          this.tab = 'metadata';
        },
        navToFormat: function () {
          this.tab = 'format';
        },
        navToData: function () {
          this.tab = 'data';
        },
        showPreview: function (filename) {
          this.previewUrl = filename ? `./readium/OEBPS/Text/${filename}` : null;
        },
        setPreviewTab: function (tab) {
          this.previewTab = tab;
        },
        copyReport: function () {
          let textarea = document.getElementById('report');
          textarea.select();
          document.execCommand('copy');
        },
        applyAllSuggestions: function () {
          this.params.structure = [...this.applySuggestion(this.params.structure, true, true)];
        },
        applyTitleSuggestion: function (filename) {
          this.params.structure = [
            ...this.applySuggestion(this.params.structure, 'title', filename),
          ];
        },
        applySubtitleSuggestion: function (filename) {
          this.params.structure = [
            ...this.applySuggestion(this.params.structure, 'subtitle', filename),
          ];
        },
        applySuggestion: function (toc, field, filename) {
          return toc.map(item => ({
            ...item,
            title:
              this.suggestedTitles[item.filename] &&
              (field === 'title' || field === true) &&
              (filename === true || item.filename === filename)
                ? this.suggestedTitles[item.filename]
                : item.title,
            subtitle:
              this.suggestedSubtitles[item.filename] &&
              (field === 'subtitle' || field === true) &&
              (filename === true || item.filename === filename)
                ? this.suggestedSubtitles[item.filename]
                : item.subtitle,
            children: this.applySuggestion(item.children, field, filename),
          }));
        },
        addSection: function () {
          const number =
            Math.max(
              ...this.params.structure
                .filter(item => item.isSection)
                .map(item => parseInt(item.id.match(/\d+$/), 10))
            ) + 1;

          this.params.structure = [
            ...this.params.structure,
            {
              isSection: true,
              inToc: true,
              id: `section-${number}`,
              children: [],
              listType: 'plain',
            },
          ];
        },
        removeSection: function () {},
      },
      computed: {
        generatedAgo: function () {
          return Math.floor((Date.now() - this.epub.generatedAt) / (60 * 1000));
        },
        unmatchedClassNames: function () {
          const matched = [];

          Object.values(this.params.elements).forEach(el => {
            if (el === '') return;

            const tokens = el.replace(/(\r\n|\n|\r)/gm, ' ').split(' ');

            tokens.forEach(token => {
              const matches = this.epub.classes.filter(item =>
                item.match(new RegExp(`^${token}$`))
              );
              matched.push(...matches);
            });
          });

          return this.epub.classes.filter(name => !matched.includes(name));
        },
        exportedData: function () {
          return JSON.stringify({ params: this.params, epub: this.epub }, null, 2);
        },
        paramKeys: function () {
          return Object.keys(this.params.elements);
        },
        structure: function () {
          return this.data.structure;
        },
        siteUrl: function () {
          return this.epub.github
            ? `https://${this.epub.github.user}.github.io/${this.epub.github.repo}/`
            : '';
        },
        paramsUrl: function () {
          return this.epub.github
            ? `https://github.com/${this.epub.github.user}/${this.epub.github.repo}/blob/main/epub/params.json`
            : '';
        },
        settingsUrl: function () {
          return this.epub.github
            ? `https://github.com/${this.epub.github.user}/${this.epub.github.repo}/settings/pages`
            : '';
        },
        suggestedTitles: function () {
          return this.epubChapters.reduce((acc, chapter) => {
            acc[chapter.filename] = chapter.titleSuggest;
            return acc;
          }, {});
        },
        suggestedSubtitles: function () {
          return this.epubChapters.reduce((acc, chapter) => {
            acc[chapter.filename] = chapter.subtitleSuggest;
            return acc;
          }, {});
        },
      },
    });
  });
