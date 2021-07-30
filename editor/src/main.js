import Vue from 'vue';
import VueNestable from 'vue-nestable';
import { toCSS, toJSON } from 'cssjson';

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

Vue.component('toc-item', {
  template: `
    <li v-if="item.role !== 'remove' && item.role !== 'colophon' && item.inToc && !(possibleCover && item.role === 'break')">
      <span class="filename">{{item.filename}}</span>
      <span class="title">{{item.title}}</span>
      <div v-if="item.children && item.children.length > 1">
        <ol v-if="item.numberedChildren">
          <toc-item v-for="item in item.children" :item="item" :key="item.filename"></toc-item>
        </ol>
        <ul v-else>
          <toc-item v-for="item in item.children" :item="item" :key="item.filename"></toc-item>
        </ul>
      </div>
    </li>
  `,
  props: ['item', 'possibleCover'],
});

Vue.component('icon', {
  template: `
    <span v-if="role == 'chapter'" class="material-icons">subject</span>
    <span v-else-if="role == 'break'" class="material-icons">photo</span>
    <span v-else-if="role == 'colophon'" class="material-icons">copyright</span>
    <span v-else-if="role == 'remove'" class="material-icons">close</span>
    `,
  props: ['role'],
});

Vue.component('toc-item-edit-title', {
  template: `
    <li v-if="item.role !== 'remove'">
      <span class="filename">
        <icon :role="item.role"></icon>
        <span class="material-icons" v-on:click="$emit('preview', item.xhtml)">visibility</span>
        {{item.filename}}
        <span v-on:click="toggleRemove" class="material-icons clickable">close</span>
      </span>

      <label>
        <textarea type="text" v-model="item.title" cols="30" rows="2" placeholder="Title"></textarea>
        <span class="suggested-title" v-on:click="$emit('updatetitle', suggestedTitles[item.filename])" v-if="suggestedTitles[item.filename]">{{suggestedTitles[item.filename]}}</span>
      </label>
      <label>
        <textarea type="text" v-model="item.subtitle" cols="30" rows="2" placeholder="Subtitle"></textarea>
        <span class="suggested-title" v-on:click="$emit('updatesubtitle', suggestedSubtitles[item.filename])" v-if="suggestedSubtitles[item.filename]">{{suggestedSubtitles[item.filename]}}</span>
      </label>

      <div v-if="item.children && item.children.length">
        <ol v-if="item.numberedChildren">
          <toc-item-edit-title v-for="item in item.children" :item="item" :key="item.filename"></toc-item-edit-title>
        </ol>
        <ul v-else>
          <toc-item-edit-title v-for="item in item.children" :item="item" :key="item.filename"></toc-item-edit-title>
        </ul>
      </div>
    </li>
  `,
  methods: {
    toggleRemove: function () {
      if (this.item.role === 'remove') this.item.role = 'chapter';
      else this.item.role = 'remove';
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
  { name: 'title', title: 'Chapter title (H1)' },
  { name: 'subtitle', title: 'Chapter subtitle' },
  { name: 'h2', title: 'Heading 1 (H2)' },
  { name: 'h3', title: 'Heading 2 (H3)' },
  { name: 'h4', title: 'Heading 3 (H4)' },
  { name: 'hr', title: 'Fleuron' },
  { name: 'hrBefore', title: 'Fleuron before' },
  { name: 'hrAfter', title: 'Fleuron after' },
  { name: 'br', title: 'Spacer' },
  { name: 'brBefore', title: 'Spacer before' },
  { name: 'brAfter', title: 'Spacer after' },
  { name: 'blockquote', title: 'Block quote' },
  { name: 'figure', title: 'Figure' },
  { name: 'em', title: 'Emphasize (italics)' },
  { name: 'strong', title: 'Important (bold)' },
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
  return chapters.map((chapter, index) => ({
    filename: chapter.filename,
    xhtml: chapter.xhtml,
    title: chapter.title,
    id: index,
    role: 'chapter',
    numberedChildren: false,
    inToc: true,
  }));
}

function loadCss(resources, setter) {
  const url = resources.find(res => res.type === 'text/css').href;

  return fetch(`readium/${url}`)
    .then(response => response.text())
    .then(text => {
      setter(toJSON(text));
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
        tab: 'metadata',
        elements,
        params:
          data.params && Object.keys(data.params).length
            ? {
                metadata: data.params.metadata,
                elements: { ...prepElObj(elements), ...data.params.elements },
                structure: data.params.structure,
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
        updateItemTitle: function (object, propertyName, value) {
          console.log(object, propertyName, value);
          this.$set(this.epub.params.structure, propertyName, value);
        },
        showPreview: function (filename) {
          this.previewUrl = filename ? `./readium/OEBPS/Text/${filename}` : null;
        },
        copyReport: function () {
          let textarea = document.getElementById('report');
          textarea.select();
          document.execCommand('copy');
        },
        applyAllSuggestions: function () {
          this.params.structure.forEach((item, index) => {
            this.$set(this.params.structure, index, {
              ...item,
              title: this.suggestedTitles[item.filename],
              subtitle: this.suggestedSubtitles[item.filename],
            });
          });
        },
      },
      computed: {
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
