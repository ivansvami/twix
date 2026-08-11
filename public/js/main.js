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

  // Лайк на отдельной (не модальной) странице поста
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

    // Клик по пустому месту (по самому оверлею, не по контенту) закрывает попап
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
});
