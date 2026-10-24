(function () {
  var toastTimer = null;

  function siteTitle() {
    var el = document.querySelector('.sidebar-link--home .sidebar-link__label');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function sectionTitle() {
    var main = document.querySelector('.content-main--section');
    if (main) {
      var fromData = main.getAttribute('data-section-title');
      if (fromData) return fromData.trim();
    }
    var heading = document.querySelector('.section-title');
    return heading ? heading.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function bhajanTitleFromCard(card) {
    if (!card) return '';
    var titleEl = card.querySelector('.bhajan-card__title');
    if (!titleEl) return '';
    var clone = titleEl.cloneNode(true);
    clone.querySelectorAll('.bhajan-card__num, .bhajan-badge').forEach(function (node) {
      node.remove();
    });
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }

  function activeBhajanCard() {
    var hash = window.location.hash.slice(1);
    if (hash) {
      var fromHash = document.getElementById(hash);
      if (fromHash && fromHash.classList.contains('bhajan-card')) return fromHash;
    }
    var status = document.getElementById('bhajan-pager-status');
    if (!status || !status.textContent.trim()) return null;
    var cards = document.querySelectorAll('.bhajan-card');
    for (var i = 0; i < cards.length; i++) {
      var cardTitle = bhajanTitleFromCard(cards[i]);
      if (cardTitle && status.textContent.indexOf(cardTitle) >= 0) return cards[i];
    }
    return cards.length ? cards[0] : null;
  }

  function sharePayload() {
    var url = window.location.href;
    var site = siteTitle();
    var section = sectionTitle();
    var card = activeBhajanCard();
    var bhajan = bhajanTitleFromCard(card);
    var title = site || document.title;
    var text = site || '';

    if (bhajan) {
      title = bhajan;
      if (section && site) text = site + ' — ' + section;
      else if (section) text = section;
      else if (site) text = site;
    } else if (section) {
      title = section;
      if (site) text = site;
    }

    return { url: url, title: title, text: text };
  }

  function showToast(message) {
    var existing = document.getElementById('share-toast');
    if (existing) existing.remove();
    if (toastTimer) window.clearTimeout(toastTimer);

    var toast = document.createElement('div');
    toast.id = 'share-toast';
    toast.className = 'share-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.appendChild(toast);

    toastTimer = window.setTimeout(function () {
      toast.remove();
      toastTimer = null;
    }, 2600);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      } catch (err) {
        reject(err);
      } finally {
        area.remove();
      }
    });
  }

  function nativeShare(payload) {
    if (!navigator.share) return Promise.reject(new Error('unsupported'));
    if (navigator.canShare && !navigator.canShare(payload)) {
      return navigator.share({ url: payload.url });
    }
    return navigator.share(payload);
  }

  function shareCurrentPage() {
    var payload = sharePayload();
    nativeShare(payload)
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        return copyText(payload.url).then(function () {
          showToast('लिंक कॉपी हो गया');
        });
      })
      .catch(function () {
        showToast('लिंक कॉपी नहीं हो सका');
      });
  }

  document.querySelectorAll('[data-action="share"]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      shareCurrentPage();
    });
  });
})();
