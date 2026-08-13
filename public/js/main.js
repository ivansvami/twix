document.addEventListener('DOMContentLoaded', function () {
  var overlay = document.getElementById('post-overlay');
  var overlayContent = document.getElementById('post-overlay-content');
  var savedFeedUrl = window.location.pathname + window.location.search;
  var isModalOpen = false;

  function lockScroll() { document.body.style.overflow = 'hidden'; }
  function unlockScroll() { document.body.style.overflow = ''; }

  function attachLikeHandler() {
    var likeBtn = overlayContent.querySelector('#like-btn') || document.getElementById('like-btn');
    if (!likeBtn || likeBtn.dataset.bound) return;
    likeBtn.dataset.bound = '1';
    likeBtn.addEventListener('click', function () {
      fetch('/post/' + likeBtn.dataset.shortid + '/like', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.ok) return;
          var countEl = likeBtn.querySelector('#like-count') || document.getElementById('like-count');
          if (countEl) countEl.textContent = data.count;
          likeBtn.classList.toggle('liked', data.liked);
        });
    });
  }

  attachLikeHandler();

  function openPostModal(shortId, pushState) {
    if (!overlay) return;
    if (!isModalOpen) {
      savedFeedUrl = window.location.pathname + window.location.search;
    }
    isModalOpen = true;
    overlay.hidden = false;
    lockScroll();
    overlayContent.innerHTML = '<div class="post-loading">Загрузка...</div>';

    fetch('/api/post/' + shortId)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) {
          overlayContent.innerHTML = '<div class="post-loading">Пост не найден</div>';
          return;
        }
        overlayContent.innerHTML = data.html;
        attachLikeHandler();
      })
      .catch(function () {
        overlayContent.innerHTML = '<div class="post-loading">Ошибка загрузки</div>';
      });

    if (pushState) {
      history.pushState({ postShortId: shortId }, '', '/post/' + shortId);
    }
  }

  function closePostModal(pushState) {
    if (!overlay || !isModalOpen) return;
    isModalOpen = false;
    overlay.hidden = true;
    overlayContent.innerHTML = '';
    unlockScroll();
    if (pushState) {
      history.pushState({}, '', savedFeedUrl);
    }
  }

  document.addEventListener('click', function (e) {
    var mediaClick = e.target.closest('.card:not(.card-youtube) .card-media');
    if (mediaClick) {
      var cardEl = mediaClick.closest('.card');
      var btn = cardEl ? cardEl.querySelector('.js-post-link') : null;
      if (btn) {
        e.preventDefault();
        openPostModal(btn.dataset.shortid, true);
        return;
      }
    }

    var link = e.target.closest('.js-post-link');
    if (link) {
      e.preventDefault();
      openPostModal(link.dataset.shortid, true);
      return;
    }

    var closeBtn = e.target.closest('.js-close-post');
    if (closeBtn) {
      e.preventDefault();
      closePostModal(true);
      return;
    }

    if (e.target === overlay) {
      closePostModal(true);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isModalOpen) {
      closePostModal(true);
    }
  });

  window.addEventListener('popstate', function (e) {
    if (e.state && e.state.postShortId) {
      openPostModal(e.state.postShortId, false);
    } else if (isModalOpen) {
      isModalOpen = false;
      overlay.hidden = true;
      overlayContent.innerHTML = '';
      unlockScroll();
    }
  });

  var notifCount = document.getElementById('notif-count');
  if (notifCount) {
    fetch('/api/notifications/unread-count')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.count > 0) {
          notifCount.textContent = data.count;
          notifCount.style.display = 'inline-block';
        }
      });
  }

  // ===== Вставка изображений из буфера обмена (Ctrl+V) на формах загрузки/редактирования =====
  function renderPastePreview(input, previewEl) {
    if (!previewEl) return;
    previewEl.innerHTML = '';
    Array.prototype.forEach.call(input.files, function (file) {
      if (file.type.indexOf('image') !== 0) return;
      var img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.className = 'paste-thumb';
      previewEl.appendChild(img);
    });
  }

  function setupPasteUpload(inputId, previewId) {
    var input = document.getElementById(inputId);
    var previewEl = document.getElementById(previewId);
    if (!input) return;

    input.addEventListener('change', function () {
      renderPastePreview(input, previewEl);
    });

    document.addEventListener('paste', function (e) {
      var clipboard = e.clipboardData || window.clipboardData;
      if (!clipboard || !clipboard.items) return;

      var imageFiles = [];
      for (var i = 0; i < clipboard.items.length; i++) {
        var item = clipboard.items[i];
        if (item.type && item.type.indexOf('image') === 0) {
          var file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length === 0) return;

      e.preventDefault();

      var dataTransfer = new DataTransfer();
      Array.prototype.forEach.call(input.files, function (f) {
        dataTransfer.items.add(f);
      });
      imageFiles.forEach(function (file, idx) {
        var ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
        var named = new File(
          [file],
          'pasted-' + Date.now() + '-' + idx + '.' + ext,
          { type: file.type }
        );
        dataTransfer.items.add(named);
      });

      input.files = dataTransfer.files;
      renderPastePreview(input, previewEl);
    });
  }

  setupPasteUpload('files-input', 'paste-preview');
  setupPasteUpload('newfiles-input', 'edit-paste-preview');

  // ===== Проигрывание YouTube-превью при наведении курсора =====
  var youtubeCards = document.querySelectorAll('.card-youtube');
  youtubeCards.forEach(function (card) {
    var iframe = card.querySelector('.yt-preview-iframe');
    if (!iframe) return;

    function sendCommand(func) {
      if (!iframe.contentWindow) return;
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: [] }), '*');
    }

    card.addEventListener('mouseenter', function () {
      sendCommand('playVideo');
    });

    card.addEventListener('mouseleave', function () {
      sendCommand('stopVideo');
    });
  });
});
