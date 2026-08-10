document.addEventListener('DOMContentLoaded', function () {
  var likeBtn = document.getElementById('like-btn');
  if (likeBtn) {
    likeBtn.addEventListener('click', function () {
      fetch('/post/' + likeBtn.dataset.id + '/like', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.ok) return;
          document.getElementById('like-count').textContent = data.count;
          likeBtn.classList.toggle('liked', data.liked);
        });
    });
  }

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
