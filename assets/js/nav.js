(function () {
  var sidebar = document.getElementById("site-sidebar");
  var searchPanel = document.getElementById("bhajan-search-panel");
  var searchBackdrop = document.getElementById("bhajan-search-backdrop");
  if (!sidebar) return;

  var menuButtons = document.querySelectorAll(".sidebar-toggle");

  function setMenuExpanded(open) {
    menuButtons.forEach(function (btn) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  function closeSearch() {
    if (!searchPanel) return;
    searchPanel.classList.remove("is-open");
    searchPanel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("search-panel-open");
    document.querySelectorAll(".search-toggle").forEach(function (btn) {
      btn.setAttribute("aria-expanded", "false");
    });
    if (searchBackdrop) searchBackdrop.hidden = true;
  }

  menuButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var open = sidebar.classList.toggle("is-open");
      setMenuExpanded(open);
      if (open) closeSearch();
    });
  });

  document.addEventListener("click", function (e) {
    if (!sidebar.classList.contains("is-open")) return;
    if (sidebar.contains(e.target) || e.target.closest(".sidebar-toggle")) return;
    sidebar.classList.remove("is-open");
    setMenuExpanded(false);
  });
})();
