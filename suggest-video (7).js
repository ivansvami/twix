document.addEventListener('DOMContentLoaded', function () {
  var overlay = document.getElementById('suggest-video-overlay');
  var openBtn = document.getElementById('open-suggest-video');
  var closeBtn = document.getElementById('close-suggest-video');
  var form = document.getElementById('suggest-video-form');
  var urlInput = document.getElementById('sv-url');
  var previewImg = document.getElementById('sv-preview-img');
  var previewPlaceholder = document.getElementById('sv-preview-placeholder');
  var submitBtn = document.getElementById('sv-submit');
  var errorEl = document.getElementById('sv-error');
  var commentInput = document.getElementById('sv-comment');
  var counterEl = document.getElementById('sv-counter');
  var categoryInput = document.getElementById('sv-category');
  var pills = document.querySelectorAll('.sv-pill');

  if (!overlay || !openBtn) return;

  function extractYoutubeId(url) {
    if (!url) return null;
    var patterns = [
      /(?:youtube\.com\/watch\?v=|youtube\.com\/watch\?.*&v=)([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = url.match(patterns[i]);
      if (match) return match[1];
    }
    return null;
  }

  function resetForm() {
    form.reset();
    previewImg.hidden = true;
    previewImg.src = '';
    previewPlaceholder.hidden = false;
    submitBtn.disabled = true;
    errorEl.hidden = true;
    errorEl.textContent = '';
    counterEl.textContent = '0/150';
    pills.forEach(function (p) { p.classList.remove('active'); });
    var defaultPill = document.querySelector('.sv-pill[data-category="Разное"]');
    if (defaultPill) defaultPill.classList.add('active');
    categoryInput.value = 'Разное';
  }

  function openModal() {
    resetForm();
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { urlInput.focus(); }, 50);
  }

  function closeModal() {
    overlay.hidden = true;
    document.body.style.overflow = '';
  }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.hidden) closeModal();
  });

  urlInput.addEventListener('input', function () {
    var id = extractYoutubeId(urlInput.value.trim());
    if (id) {
      previewImg.src = 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg';
      previewImg.hidden = false;
      previewPlaceholder.hidden = true;
      submitBtn.disabled = false;
    } else {
      previewImg.hidden = true;
      previewPlaceholder.hidden = false;
      submitBtn.disabled = true;
    }
    errorEl.hidden = true;
  });

  commentInput.addEventListener('input', function () {
    counterEl.textContent = commentInput.value.length + '/150';
  });

  pills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      pills.forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      categoryInput.value = pill.dataset.category;
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправка...';

    fetch('/api/suggest-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: urlInput.value.trim(),
        category: categoryInput.value,
        comment: commentInput.value.trim()
      })
    })
      .then(function (r) { return r.json(); })
.then(function (data) {
        if (!data.ok) {
          errorEl.textContent = data.error || 'Не удалось отправить, попробуйте ещё раз';
          errorEl.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Отправить';
          return;
        }
        submitBtn.textContent = 'Готово!';
        window.location.reload();
      })
      .catch(function () {
        errorEl.textContent = 'Ошибка сети, попробуйте ещё раз';
        errorEl.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Отправить';
      });
  });

  // Синхронизация счётчика уведомлений с мобильным нижним меню
  var mbCount = document.getElementById('mb-notif-count');
  if (mbCount) {
    fetch('/api/notifications/unread-count')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.count > 0) {
          mbCount.textContent = data.count;
          mbCount.hidden = false;
        }
      });
  }
});
