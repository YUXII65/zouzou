function stripStickyStepPrefix(value) {
  return String(value || "")
    .replace(
      /^\s*(?:(?:第\s*[一二三四五六七八九十\d]+\s*[步部分]?[:：、.)）]?)|(?:\d{1,2}\s*[.、)）])|(?:\d{1,2}\s+(?!(?:个|件|条|天|周|月|年|小时|分钟|家|次|种|张|页|步|人|份|元|块|公里|岁|本|门|套|款|项|位|名|所|场|局|轮|遍|%)))|(?:[①②③④⑤⑥⑦⑧⑨⑩])|(?:[一二三四五六七八九十]\s*[、.)）]))\s*/u,
      "",
    )
    .trim();
}

function normalizeStickySteps(note) {
  const source = note && typeof note === "object" ? note : {};
  const steps = Array.isArray(source.steps) ? source.steps : [];
  return (steps.length ? steps : [source.nextStep])
    .map(stripStickyStepPrefix)
    .filter(Boolean);
}

module.exports = { normalizeStickySteps, stripStickyStepPrefix };
