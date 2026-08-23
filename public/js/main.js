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

  function attachCopyLinkHandler(root) {
    var scope = root || document;
    var copyButton = scope.querySelector('#copy-post-link');
    if (!copyButton || copyButton.dataset.bound) return;
    copyButton.dataset.bound = '1';

    copyButton.addEventListener('click', function () {
      var relativeUrl = copyButton.dataset.url;
      var url = new URL(relativeUrl, window.location.origin).href;

      navigator.clipboard.writeText(url).then(function () {
        var oldHtml = copyButton.innerHTML;

        copyButton.innerHTML =
          '<svg width="19" height="19" viewBox="0 0 24 24" fill="none">' +
          '<path d="M5 12.5l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg>';

        copyButton.classList.add('copied');

        setTimeout(function () {
          copyButton.innerHTML = oldHtml;
          copyButton.classList.remove('copied');
        }, 1200);
      }).catch(function (error) {
        console.error('Не удалось скопировать ссылку:', error);
      });
    });
  }

  attachLikeHandler();
  attachCopyLinkHandler(document);

  // Обновляет содержимое текущего поста после изменения комментария.
  // В модалке перерисовываем только HTML поста, на отдельной странице
  // делаем обычную перезагрузку страницы.
  function refreshCurrentPost() {
    var root = document.querySelector('.post-modal-inner[data-post-shortid]');
    var shortId = root ? root.dataset.postShortid : null;

    if (!shortId) {
      window.location.reload();
      return Promise.resolve();
    }

    if (!overlay || overlay.hidden || !isModalOpen) {
      window.location.reload();
      return Promise.resolve();
    }

    return fetch('/api/post/' + shortId, {
      headers: { 'Accept': 'application/json' }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Не удалось обновить пост');
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error('Не удалось обновить пост');
        overlayContent.innerHTML = data.html;
        attachLikeHandler();
        attachCopyLinkHandler(overlayContent);
        if (window.initCustomPlayers) window.initCustomPlayers(overlayContent);
      });
  }

  function submitCommentForm(form) {
    if (form.dataset.submitting === '1') return;
    form.dataset.submitting = '1';

    var buttons = form.querySelectorAll('button');
    buttons.forEach(function (button) { button.disabled = true; });

    var body = new FormData(form);

    fetch(form.action, {
      method: 'POST',
      body: body,
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin'
    })
      .then(function (response) {
        if (!response.ok) {
          return response.text().then(function (text) {
            throw new Error(text || 'Не удалось выполнить действие');
          });
        }
        return refreshCurrentPost();
      })
      .catch(function (error) {
        console.error(error);
        alert('Не удалось выполнить действие с комментарием. Попробуйте ещё раз.');
      })
      .finally(function () {
        form.dataset.submitting = '';
        buttons.forEach(function (button) { button.disabled = false; });
      });
  }

  // ===== Действия с комментариями =====
  document.addEventListener('click', function (e) {
    var replyButton = e.target.closest('.js-reply-comment');
    if (replyButton) {
      var replyScope = replyButton.closest('.comment-content-new');
      var replyForm = replyScope ? replyScope.querySelector('.comment-reply-form-new') : null;
      if (!replyForm) return;

      e.preventDefault();

      document.querySelectorAll('.comment-reply-form-new:not([hidden])').forEach(function (form) {
        if (form !== replyForm) form.hidden = true;
      });

      document.querySelectorAll('.comment-edit-form-new:not([hidden])').forEach(function (form) {
        form.hidden = true;
      });

      replyForm.hidden = false;
      var textarea = replyForm.querySelector('textarea');
      if (textarea) {
        textarea.focus();
      }
      return;
    }

    var cancelReply = e.target.closest('.js-cancel-reply');
    if (cancelReply) {
      e.preventDefault();
      var replyFormToClose = cancelReply.closest('.comment-reply-form-new');
      if (replyFormToClose) {
        replyFormToClose.hidden = true;
        var replyTextarea = replyFormToClose.querySelector('textarea');
        if (replyTextarea) replyTextarea.value = '';
      }
      return;
    }

    var editButton = e.target.closest('.js-edit-comment');
    if (editButton) {
      var editScope = editButton.closest('.comment-content-new');
      var editForm = editScope ? editScope.querySelector('.comment-edit-form-new') : null;
      if (!editForm) return;

      e.preventDefault();
      editForm.hidden = false;

      var editTextarea = editForm.querySelector('textarea');
      if (editTextarea) {
        editTextarea.focus();
        editTextarea.setSelectionRange(editTextarea.value.length, editTextarea.value.length);
      }
      return;
    }

    var cancelEdit = e.target.closest('.js-cancel-comment-edit');
    if (cancelEdit) {
      e.preventDefault();
      var editFormToClose = cancelEdit.closest('.comment-edit-form-new');
      if (editFormToClose) editFormToClose.hidden = true;
      return;
    }

    var commentLike = e.target.closest('.comment-like-btn-new');
    if (commentLike) {
      e.preventDefault();
      if (commentLike.dataset.loading === '1') return;
      commentLike.dataset.loading = '1';
      commentLike.disabled = true;

      fetch('/comment/' + commentLike.dataset.commentId + '/like', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.ok) throw new Error('Не удалось поставить лайк');
          var count = commentLike.querySelector('span');
          if (count) count.textContent = data.count;
          commentLike.classList.toggle('liked', data.liked);
        })
        .catch(function (error) {
          console.error(error);
        })
        .finally(function () {
          commentLike.dataset.loading = '';
          commentLike.disabled = false;
        });
      return;
    }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('.js-comment-form');
    if (!form) return;

    if (form.classList.contains('comment-delete-form-new')) {
      if (!window.confirm('Удалить комментарий? Все его ответы тоже будут удалены.')) {
        e.preventDefault();
        return;
      }
    }

    e.preventDefault();
    submitCommentForm(form);
  });

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
        attachCopyLinkHandler(overlayContent);
        if (window.initCustomPlayers) window.initCustomPlayers(overlayContent);
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
      if (isModalOpen) {
        e.preventDefault();
        closePostModal(true);
      }
      // Если попап не открыт (это отдельная полная страница поста) —
      // ничего не перехватываем, крестик просто работает как обычная ссылка href="/"
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
