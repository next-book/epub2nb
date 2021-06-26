const path = require('path');

module.exports = {
  entry: './src/main.js',
  output: {
    path: path.resolve(__dirname, 'assets'),
    filename: 'editor.js',
  },
  resolve: {
    alias: {
      vue: 'vue/dist/vue.js',
    },
  },
};
