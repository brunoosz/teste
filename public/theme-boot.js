try {
  var t = localStorage.getItem("fileflow-theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch (e) {}
