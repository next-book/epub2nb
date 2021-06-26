const analyze = (dom) => {
  return {
    classes: getClasses(dom),
  };
};

const getClasses = (dom) => {
  const classes = [];

  const names = Object.values(dom("body *")).map((el) => {
    if (el.attribs && el.attribs.class)
      el.attribs.class.split(/\s/).forEach((className) => {
        if (!classes.includes(className)) classes.push(className);
      });
  });

  return classes;
};

module.exports = analyze;
