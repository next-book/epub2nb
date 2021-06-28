#!/usr/bin/env node

const cmd = require('commander');
const path = require('path');

const app = require('./../src/js/app.js');

cmd
  .option('-s, --dir [path]', 'Input dir with an EPUB to convert')
  .option('-g, --gh [repo]', 'Github repository name (user/repo)')
  .parse(process.argv);

const options = cmd.opts();

app.convertBook(path.join(process.cwd(), options.dir), options.gh);
