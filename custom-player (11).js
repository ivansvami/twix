(function () {
  var DEFAULT_VOLUME = 0.2;

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function initOne(root) {
    if (!root || root.dataset.cpBound) return;
    root.dataset.cpBound = '1';

    var video = root.querySelector('.cp-video');
    var bigPlay = root.querySelector('.cp-bigplay');
    var playBtn = root.querySelector('.cp-play');
    var iconPlay = root.querySelector('.cp-icon-play');
    var iconPause = root.querySelector('.cp-icon-pause');
    var muteBtn = root.querySelector('.cp-mute');
    var iconVolOn = root.querySelector('.cp-icon-vol-on');
    var iconVolOff = root.querySelector('.cp-icon-vol-off');
    var volumeSlider = root.querySelector('.cp-volume');
    var timeEl = root.querySelector('.cp-time');
    var progress = root.querySelector('.cp-progress');
    var progressFill = root.querySelector('.cp-progress-fill');
    var progressBuffered = root.querySelector('.cp-progress-buffered');
    var progressHandle = root.querySelector('.cp-progress-handle');
    var speedToggle = root.querySelector('.cp-speed-toggle');
    var speedMenu = root.querySelector('.cp-speed-menu');
    var speedOptions = root.querySelectorAll('.cp-speed-option');
    var fullscreenBtn = root.querySelector('.cp-fullscreen');
    if (!video) return;

    // Громкость по умолчанию — 20%
    video.volume = DEFAULT_VOLUME;
    if (volumeSlider) volumeSlider.value = DEFAULT_VOLUME;

    function setPlayingUI(playing) {
      root.classList.toggle('is-playing', playing);
      if (iconPlay) iconPlay.hidden = playing;
      if (iconPause) iconPause.hidden = !playing;
    }

    function togglePlay() {
      if (video.paused) video.play();
      else video.pause();
    }

    if (bigPlay) bigPlay.addEventListener('click', togglePlay);
    if (playBtn) playBtn.addEventListener('click', togglePlay);
    video.addEventListener('click', togglePlay);
    video.addEventListener('play', function () { setPlayingUI(true); });
    video.addEventListener('pause', function () { setPlayingUI(false); });

    video.addEventListener('loadedmetadata', function () {
      timeEl.textContent = formatTime(0) + ' / ' + formatTime(video.duration);
    });

    video.addEventListener('timeupdate', function () {
      timeEl.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
      var pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
      progressFill.style.width = pct + '%';
      progressHandle.style.left = pct + '%';
    });

    video.addEventListener('progress', function () {
      if (!video.duration || !video.buffered.length) return;
      try {
        var end = video.buffered.end(video.buffered.length - 1);
        var pct = (end / video.duration) * 100;
        if (progressBuffered) progressBuffered.style.width = pct + '%';
      } catch (e) { /* игнорируем, если диапазон недоступен */ }
    });

    function seekFromEvent(e) {
      var rect = progress.getBoundingClientRect();
      var clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
      var pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      if (video.duration) video.currentTime = pct * video.duration;
    }

    var seeking = false;
    progress.addEventListener('mousedown', function (e) { seeking = true; seekFromEvent(e); });
    document.addEventListener('mousemove', function (e) { if (seeking) seekFromEvent(e); });
    document.addEventListener('mouseup', function () { seeking = false; });
    progress.addEventListener('touchstart', function (e) { seeking = true; seekFromEvent(e); });
    progress.addEventListener('touchmove', function (e) { if (seeking) seekFromEvent(e); });
    document.addEventListener('touchend', function () { seeking = false; });

    function setMutedUI(muted) {
      if (iconVolOn) iconVolOn.hidden = muted;
      if (iconVolOff) iconVolOff.hidden = !muted;
    }

    if (muteBtn) {
      muteBtn.addEventListener('click', function () {
        video.muted = !video.muted;
        setMutedUI(video.muted);
      });
    }

    if (volumeSlider) {
      volumeSlider.addEventListener('input', function () {
        video.volume = parseFloat(volumeSlider.value);
        video.muted = video.volume === 0;
        setMutedUI(video.muted);
      });
    }

    if (speedToggle && speedMenu) {
      speedToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        speedMenu.hidden = !speedMenu.hidden;
      });
      document.addEventListener('click', function (e) {
        if (!speedMenu.hidden && !speedMenu.contains(e.target) && e.target !== speedToggle) {
          speedMenu.hidden = true;
        }
      });
      speedOptions.forEach(function (opt) {
        opt.addEventListener('click', function () {
          video.playbackRate = parseFloat(opt.dataset.speed);
          speedOptions.forEach(function (o) { o.classList.remove('is-active'); });
          opt.classList.add('is-active');
          speedMenu.hidden = true;
        });
      });
    }

    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', function () {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else if (root.requestFullscreen) {
          root.requestFullscreen();
        }
      });
    }
  }

  function initAll(container) {
    var scope = container || document;
    scope.querySelectorAll('[data-custom-player]').forEach(initOne);
  }

  window.initCustomPlayers = initAll;

  document.addEventListener('DOMContentLoaded', function () {
    initAll(document);
  });
})();
