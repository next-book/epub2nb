import Vue from 'vue';
import VueNestable from 'vue-nestable';

import AutoComplete from './autocomplete';

Vue.use(VueNestable);
Vue.component('autocomplete', AutoComplete);

Vue.component('toc-item', {
  template: `
    <li v-if="item.role !== 'remove' && item.inToc">
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
};

function prepStructure(files) {
  return files.map((file, index) => ({
    filename: file.filename,
    title: file.title,
    id: index,
    role: 'chapter',
    numberedChildren: false,
    inToc: true,
  }));
}

fetch('./params.json')
  .then(response => response.json())
  .then(data => {
    var app = new Vue({
      el: '#app',
      data: {
        tab: 'structure',
        params:
          data.params && Object.keys(data.params).length
            ? data.params
            : {
                elements,
                structure: prepStructure(data.epub.files),
              },
        epub: data.epub,
      },
      methods: {
        navToStructure: function () {
          this.tab = 'structure';
        },
        navToFormat: function () {
          this.tab = 'format';
        },
        navToData: function () {
          this.tab = 'data';
        },
      },
      computed: {
        exportedData: function () {
          return JSON.stringify({ params: this.params, epub: this.epub }, null, 2);
        },
        paramKeys: function () {
          return Object.keys(this.params.elements);
        },
        structure: function () {
          return this.data.structure;
        },
      },
    });
  });

document.getElementById('copy-report').addEventListener('clicl', function () {
  document.getElementById('report').select();
  document.execCommand('copy');
});
