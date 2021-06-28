// Based with permission on code written by Phil https://github.com/ph1p
// https://codepen.io/ph1p/pen/GEJYBZ

const hash = function (str) {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    let chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

const Autocomplete = {
  template: '#autocomplete-tpl',
  props: ['value', 'items', 'placeholder', 'label', 'rows', 'cols'],
  data() {
    return {
      id: 'input-' + hash(this.label),
      searchMatch: [],
      selectedIndex: 0,
      clickedChooseItem: false,
      wordIndex: 0,
    };
  },
  mounted() {
    const _self = this;
    document.querySelector('#' + this.id).addEventListener('input', function () {
      const caret = getCaretCoordinates(this, this.selectionEnd);

      if (_self.searchMatch.length > 0) {
        const element = document.querySelectorAll('.' + _self.id + '-list');

        if (element[0]) {
          element[0].style.top = caret.top + 40 + 'px';
          element[0].style.left = caret.left + 20 + 'px';
        }
      }
    });
  },
  computed: {
    matching() {
      const tokens = this.value.replace(/(\r\n|\n|\r)/gm, ' ').split(' ');
      const matches = [];

      tokens.forEach(token => {
        const tMatches = this.items.filter(item => item.match(new RegExp(`^${token}$`)));
        matches.push(...tMatches);
      });

      return matches;
    },
    listToSearch() {
      if (typeof this.items !== 'undefined' && this.items.length > 0) {
        return this.items;
      } else {
        return ['abeceda'];
      }
    },
    currentWord() {
      return this.value.replace(/(\r\n|\n|\r)/gm, ' ').split(' ')[this.wordIndex];
    },
    inputSplitted() {
      return this.value.replace(/(\r\n|\n|\r)/gm, ' ').split(' ');
    },
  },
  watch: {
    value() {
      this.focus();
      this.selectedIndex = 0;
      this.wordIndex = this.inputSplitted.length - 1;
    },
  },
  methods: {
    highlightWord(word) {
      const regex = new RegExp('(' + this.currentWord + ')', 'g');
      return word.replace(regex, '<mark>$1</mark>');
    },
    setWord(word) {
      let currentWords = this.value.replace(/(\r\n|\n|\r)/gm, '__br__ ').split(' ');
      currentWords[this.wordIndex] = currentWords[this.wordIndex].replace(
        this.currentWord,
        word + ' '
      );
      this.wordIndex += 1;
      this.$emit('input', currentWords.join(' ').replace(/__br__\s/g, '\n'));
    },
    moveDown() {
      if (this.selectedIndex < this.searchMatch.length - 1) {
        this.selectedIndex++;
      }
    },
    moveUp() {
      if (this.selectedIndex !== -1) {
        this.selectedIndex--;
      }
    },
    selectItem(index) {
      this.selectedIndex = index;
      this.chooseItem();
    },
    chooseItem(e) {
      this.clickedChooseItem = true;

      if (this.selectedIndex !== -1 && this.searchMatch.length > 0) {
        if (e) {
          e.preventDefault();
        }
        this.setWord(this.searchMatch[this.selectedIndex]);
        this.selectedIndex = -1;
      }
    },
    focusout(e) {
      setTimeout(() => {
        if (!this.clickedChooseItem) {
          this.searchMatch = [];
          this.selectedIndex = -1;
        }
        this.clickedChooseItem = false;
      }, 100);
    },
    focus() {
      this.searchMatch = [];

      if (this.currentWord !== '') {
        this.searchMatch = this.listToSearch.filter(el => el.indexOf(this.currentWord) >= 0);
      }
      if (this.searchMatch.length === 1 && this.currentWord === this.searchMatch[0]) {
        this.searchMatch = [];
      }
    },
  },
};

// Thanks: https://github.com/component/textarea-caret-position
// Licensed under the MIT License
(function () {
  function e(b, e, f) {
    if (!h)
      throw Error('textarea-caret-position#getCaretCoordinates should only be called in a browser');
    if ((f = (f && f.debug) || !1)) {
      var a = document.querySelector('#input-textarea-caret-position-mirror-div');
      a && a.parentNode.removeChild(a);
    }
    a = document.createElement('div');
    a.id = 'input-textarea-caret-position-mirror-div';
    document.body.appendChild(a);
    var c = a.style,
      d = window.getComputedStyle ? window.getComputedStyle(b) : b.currentStyle,
      k = 'INPUT' === b.nodeName;
    c.whiteSpace = 'pre-wrap';
    k || (c.wordWrap = 'break-word');
    c.position = 'absolute';
    f || (c.visibility = 'hidden');
    l.forEach(function (a) {
      k && 'lineHeight' === a ? (c.lineHeight = d.height) : (c[a] = d[a]);
    });
    m ? b.scrollHeight > parseInt(d.height) && (c.overflowY = 'scroll') : (c.overflow = 'hidden');
    a.textContent = b.value.substring(0, e);
    k && (a.textContent = a.textContent.replace(/\s/g, '\u00a0'));
    var g = document.createElement('span');
    g.textContent = b.value.substring(e) || '.';
    a.appendChild(g);
    b = {
      top: g.offsetTop + parseInt(d.borderTopWidth),
      left: g.offsetLeft + parseInt(d.borderLeftWidth),
      height: parseInt(d.lineHeight),
    };
    f ? (g.style.backgroundColor = '#aaa') : document.body.removeChild(a);
    return b;
  }
  var l = 'direction boxSizing width height overflowX overflowY borderTopWidth borderRightWidth borderBottomWidth borderLeftWidth borderStyle paddingTop paddingRight paddingBottom paddingLeft fontStyle fontVariant fontWeight fontStretch fontSize fontSizeAdjust lineHeight fontFamily textAlign textTransform textIndent textDecoration letterSpacing wordSpacing tabSize MozTabSize'.split(
      ' '
    ),
    h = 'undefined' !== typeof window,
    m = h && null != window.mozInnerScreenX;
  'undefined' != typeof module && 'undefined' != typeof module.exports
    ? (module.exports = e)
    : h && (window.getCaretCoordinates = e);
})();

export default Autocomplete;
