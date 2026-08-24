// КАРУСЕЛЬ ВЛОЖЕНИЙ ПОСТА (стрелки, точки, свайп на мобильных)
(function () {
  // Элементы управления (кнопки, ссылки, инпуты плеера), клик/тач по которым
  // не должен запускать перетаскивание карусели.
  var CONTROL_SELECTOR = 'button, a, input, .cp-controls, .cp-progress, .cp-speed-menu, .cp-volume';

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function pointerFromEvent(e) {
    if (e.touches && e.touches.length) return e.touches[0];
    if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0];
    return e;
  }

  function initOne(root) {
    if (!root || root.dataset.pmBound) return;
    root.dataset.pmBound = '1';

    var track = root.querySelector('[data-pm-track]');
    var slides = Array.prototype.slice.call(root.querySelectorAll('[data-pm-slide]'));
    var prevBtn = root.querySelector('[data-pm-prev]');
    var nextBtn = root.querySelector('[data-pm-next]');
    var dots = Array.prototype.slice.call(root.querySelectorAll('[data-pm-dot]'));
    if (!track || slides.length === 0) return;

    // Запрещаем нативное перетаскивание картинок мышью, чтобы оно не мешало свайпу
    slides.forEach(function (slide) {
      slide.querySelectorAll('img').forEach(function (img) { img.draggable = false; });
    });

    var index = 0;
    var count = slides.length;

    function pauseSlideMedia(slide) {
      slide.querySelectorAll('video, audio').forEach(function (m) {
        try { m.pause(); } catch (e) { /* noop */ }
      });
    }

    function render() {
      track.style.transform = 'translateX(' + (-index * 100) + '%)';

      if (prevBtn) prevBtn.disabled = index === 0;
      if (nextBtn) nextBtn.disabled = index === count - 1;

      dots.forEach(function (dot, i) {
        dot.classList.toggle('is-active', i === index);
      });

      slides.forEach(function (slide, i) {
        if (i !== index) pauseSlideMedia(slide);
      });
    }

    function goTo(i) {
      var next = clamp(i, 0, count - 1);
      if (next === index) return;
      index = next;
      render();
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { goTo(index - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { goTo(index + 1); });

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () { goTo(i); });
    });

    if (count > 1) {
      // ===== Свайп / перетаскивание (тач и мышь) =====
      var startX = 0;
      var startY = 0;
      var currentX = 0;
      var dragging = false;
      var isHorizontal = null;

      function onStart(e) {
        if (e.target.closest(CONTROL_SELECTOR)) return;
        var p = pointerFromEvent(e);
        startX = p.clientX;
        startY = p.clientY;
        currentX = startX;
        dragging = true;
        isHorizontal = null;
        track.style.transition = 'none';
      }

      function onMove(e) {
        if (!dragging) return;
        var p = pointerFromEvent(e);
        currentX = p.clientX;
        var dx = currentX - startX;
        var dy = p.clientY - startY;

        if (isHorizontal === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
          isHorizontal = Math.abs(dx) > Math.abs(dy);
        }
        if (!isHorizontal) return;

        if (e.cancelable) e.preventDefault();

        var width = root.clientWidth || 1;
        var percent = (dx / width) * 100;

        // Небольшое сопротивление на краях, если дальше двигаться некуда
        if ((index === 0 && dx > 0) || (index === count - 1 && dx < 0)) {
          percent *= 0.35;
        }

        track.style.transform = 'translateX(' + (-index * 100 + percent) + '%)';
      }

      function onEnd() {
        if (!dragging) return;
        dragging = false;
        track.style.transition = '';

        if (!isHorizontal) { render(); return; }

        var dx = currentX - startX;
        var threshold = (root.clientWidth || 1) * 0.15;

        if (dx <= -threshold && index < count - 1) {
          index += 1;
        } else if (dx >= threshold && index > 0) {
          index -= 1;
        }
        render();
      }

      track.addEventListener('touchstart', onStart, { passive: true });
      track.addEventListener('touchmove', onMove, { passive: false });
      track.addEventListener('touchend', onEnd);
      track.addEventListener('touchcancel', onEnd);

      track.addEventListener('mousedown', function (e) {
        if (e.target.closest(CONTROL_SELECTOR)) return;
        onStart(e);

        function moveHandler(ev) { onMove(ev); }
        function upHandler(ev) {
          onEnd(ev);
          document.removeEventListener('mousemove', moveHandler);
          document.removeEventListener('mouseup', upHandler);
        }
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
      });

      // ===== Стрелки клавиатуры, когда фокус внутри карусели =====
      root.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') goTo(index - 1);
        if (e.key === 'ArrowRight') goTo(index + 1);
      });
    }

    render();
  }

  function initAll(container) {
    var scope = container || document;
    scope.querySelectorAll('[data-pm-carousel]').forEach(initOne);
  }

  window.initPostCarousels = initAll;

  document.addEventListener('DOMContentLoaded', function () {
    initAll(document);
  });
})();
