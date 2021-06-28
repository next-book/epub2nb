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
    <li v-if="item.role !== 'remove' && item.role !== 'colophon' && item.inToc && !(top && item.role === 'cover')">
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
  props: ['item', 'top'],
});

Vue.component('icon', {
  template: `
    <span v-if="role == 'chapter'" class="material-icons">subject</span>
    <span v-else-if="role == 'cover'" class="material-icons">photo</span>
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
      </span>
      <label>
        Title
        <textarea type="text" v-model="item.title" cols="30" rows="2"></textarea>
      </label>
      <label>
        Subtitle
        <textarea type="text" v-model="item.subtitle" cols="30" rows="2"></textarea>
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
  props: ['item'],
});

var elements = {
  title: '',
  subtitle: '',
  h2: '',
  h3: '',
  h4: '',
  hr: '',
  invisibleHr: '',
  blockquote: '',
  figure: '',
  em: '',
  strong: '',
  remove: '',
  ignore: '',
};

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
      console.log(toJSON(text));
      setter(toJSON(text));
    });
}

fetch('./params.json')
  .then(response => response.json())
  .then(data => {
    var app = new Vue({
      el: '#app',
      data: {
        previewUrl: null,
        tab: 'metadata',
        params:
          data.params && Object.keys(data.params).length
            ? data.params
            : {
                metadata: data.epub.metadata,
                elements,
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
        copyReport: function () {
          let textarea = document.getElementById('report');
          textarea.select();
          document.execCommand('copy');
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
      },
    });
  });
