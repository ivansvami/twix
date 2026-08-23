// Бесконечная лента с автоподгрузкой (как на eblo.id) для "Ленты" и вкладки "Видео".
document.addEventListener('DOMContentLoaded', function () {
  var grid = document.getElementById('posts-grid');
  if (!grid) return;

  var sentinel = document.getElementById('feed-sentinel');
  var loadingEl = document.getElementById('feed-loading');
  var endEl = document.getElementById('feed-end');

  var endpoint = grid.dataset.endpoint;
  var page = parseInt(grid.dataset.page, 10) || 1;
  var hasMore = grid.dataset.hasMore === '1';
  var isLoading = false;
  var observer = null;

  if (!endpoint || !hasMore) {
    return;
  }

  function buildNextUrl(nextPage) {
    var params = new URLSearchParams(window.location.search);
    params.set('page', nextPage);
    return endpoint + '?' + params.toString();
  }

  function stopObserving() {
    if (observer) observer.disconnect();
    window.removeEventListener('scroll', onScrollFallback);
  }

  function loadMore() {
    if (isLoading || !hasMore) return;
    isLoading = true;
    if (loadingEl) loadingEl.hidden = false;
    if (endEl) endEl.hidden = true;

    var nextPage = page + 1;

    fetch(buildNextUrl(nextPage), { headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('Не удалось загрузить публикации');
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error('Не удалось загрузить публикации');

        if (data.html && data.html.trim()) {
          var emptyMsg = document.getElementById('empty-feed');
          if (emptyMsg) emptyMsg.remove();
          grid.insertAdjacentHTML('beforeend', data.html);
          if (window.initCustomPlayers) window.initCustomPlayers(grid);
        }

        page = nextPage;
        hasMore = !!data.hasMore;

        if (!hasMore) {
          stopObserving();
          if (endEl) endEl.hidden = false;
        }
      })
      .catch(function (err) {
        console.error('Автоподгрузка ленты:', err);
        hasMore = false;
        stopObserving();
      })
      .finally(function () {
        isLoading = false;
        if (loadingEl) loadingEl.hidden = true;
      });
  }

  function onScrollFallback() {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 800) {
      loadMore();
    }
  }

  if (sentinel && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) loadMore();
      });
    }, { rootMargin: '600px 0px' });
    observer.observe(sentinel);
  } else {
    window.addEventListener('scroll', onScrollFallback);
  }
});
