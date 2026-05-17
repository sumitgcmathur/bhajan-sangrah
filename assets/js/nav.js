(function () {
  var btn = document.querySelector(".sidebar-toggle");
  var sidebar = document.getElementById("site-sidebar");
  if (!btn || !sidebar) return;
  btn.addEventListener("click", function () {
    var open = sidebar.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", function (e) {
    if (!sidebar.classList.contains("is-open")) return;
    if (sidebar.contains(e.target) || btn.contains(e.target)) return;
    sidebar.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  });
})();
