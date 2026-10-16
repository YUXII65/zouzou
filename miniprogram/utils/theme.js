const THEME_KEY = "next_step_miniprogram_theme";

function normalizeTheme(value) {
  return value === "dark" ? "dark" : "light";
}

function getTheme() {
  return normalizeTheme(wx.getStorageSync(THEME_KEY));
}

function setTheme(value) {
  const theme = normalizeTheme(value);
  wx.setStorageSync(THEME_KEY, theme);
  return theme;
}

function toggleTheme() {
  return setTheme(getTheme() === "dark" ? "light" : "dark");
}

module.exports = { getTheme, setTheme, toggleTheme };
