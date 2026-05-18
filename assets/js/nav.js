(function () {
  var btn = document.querySelector(".sidebar-toggle");
  var sidebar = document.getElementById("site-sidebar");
  var searchPanel = document.getElementById("bhajan-search-panel");
  var searchToggle = document.querySelector(".search-toggle");
  var searchBackdrop = document.getElementById("bhajan-search-backdrop");
  if (!btn || !sidebar) return;

  function closeSearch() {
    if (!searchPanel) return;
    searchPanel.classList.remove("is-open");
    searchPanel.setAttribute("aria-hidden", "true");
    if (searchToggle) searchToggle.setAttribute("aria-expanded", "false");
    if (searchBackdrop) searchBackdrop.hidden = true;
  }

  btn.addEventListener("click", function () {
    var open = sidebar.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) closeSearch();
  });
  document.addEventListener("click", function (e) {
    if (!sidebar.classList.contains("is-open")) return;
    if (sidebar.contains(e.target) || btn.contains(e.target)) return;
    sidebar.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  });
})();
