(function () {
  var sidebar = document.getElementById("site-sidebar");
  if (!sidebar) return;

  var menuButtons = document.querySelectorAll(".sidebar-toggle");

  function setMenuExpanded(open) {
    menuButtons.forEach(function (btn) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  function closeSearchPanel() {
    var panel = document.getElementById("bhajan-search-panel");
    if (!panel || !panel.classList.contains("is-open")) return;
    document.querySelectorAll(".search-toggle").forEach(function (btn) {
      btn.click();
    });
  }

  menuButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var open = sidebar.classList.toggle("is-open");
      setMenuExpanded(open);
      if (open) closeSearchPanel();
    });
  });

  document.addEventListener("click", function (e) {
    if (!sidebar.classList.contains("is-open")) return;
    if (sidebar.contains(e.target) || e.target.closest(".sidebar-toggle")) return;
    sidebar.classList.remove("is-open");
    setMenuExpanded(false);
  });
})();
