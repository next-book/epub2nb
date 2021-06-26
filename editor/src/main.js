import Vue from 'vue';
import VueNestable from 'vue-nestable';

import AutoComplete from './autocomplete';

Vue.use(VueNestable);
Vue.component('autocomplete', AutoComplete);

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
    title: file.title.substr(0, 30),
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
        params:
          data.params && Object.keys(data.params).length
            ? data.params
            : {
                elements,
                structure: prepStructure(data.epub.files),
              },
        epub: data.epub,
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
