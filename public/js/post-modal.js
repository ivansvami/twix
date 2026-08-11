// КЛИЕНТСКИЙ СКРИПТ ДЛЯ ОТКРЫТИЯ МОДАЛКИ И КОРОТКИХ ССЫЛОК

function generateShortId() {
  return Math.random().toString(36).substring(2, 9);
}

// Преобразование любой YouTube-ссылки в прямую страницу видео
function getYouTubeWatchUrl(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  return match ? 'https://www.youtube.com/watch?v=' + match[1] : null;
}

// Открытие модалки поста
async function openPostModal(event, postId, shortId, mediaUrl, title, author) {
  let candidateUrl = mediaUrl || '';

  // 1. Поиск карточки по классам .post-card или .card
  let cardElement = null;
  if (event && event.target) {
    cardElement = event.target.closest('.post-card, .card');
  } else if (event && event.currentTarget) {
    cardElement = event.currentTarget;
  }

  // 2. Достаем ссылку из элементов внутри карточки
  if (cardElement) {
    // Проверяем iframe (встроенный YouTube)
    const iframe = cardElement.querySelector('iframe');
    if (iframe && iframe.src) {
      candidateUrl = candidateUrl || iframe.src;
    }

    // Проверяем ссылки <a>
    const cardLink = cardElement.querySelector('a') || (cardElement.tagName === 'A' ? cardElement : null);
    if (cardLink && cardLink.href) {
      candidateUrl = candidateUrl || cardLink.href;
    }

    // Проверяем data-атрибут
    if (cardElement.dataset.url) {
      candidateUrl = candidateUrl || cardElement.dataset.url;
    }
  }

  // 3. Проверяем, ведет ли ссылка на YouTube
  const ytWatchUrl = getYouTubeWatchUrl(candidateUrl) || getYouTubeWatchUrl(mediaUrl);

  if (ytWatchUrl) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    window.open(ytWatchUrl, '_blank'); // Открываем YouTube в новой вкладке
    return;                            // Прерываем открытие модалки
  }

  if (event) event.preventDefault();

  // 4. Логика для обычных постов
  const displayId = shortId || postId || generateShortId();

  // Меняем URL в адресной строке без перезагрузки
  history.pushState({ postId: displayId }, "", "/post/" + displayId);

  const modalMedia = document.getElementById("modalMedia");
  const modalSidebar = document.getElementById("modalSidebar");

  if (modalMedia) {
    if (candidateUrl && (candidateUrl.endsWith('.mp4') || candidateUrl.endsWith('.webm'))) {
      modalMedia.innerHTML = `<video src="${candidateUrl}" controls autoplay loop></video>`;
    } else {
      modalMedia.innerHTML = `<img src="${candidateUrl || ''}" alt="Post Media">`;
    }
  }

  if (modalSidebar) {
    modalSidebar.innerHTML = `
      <div class="modal-author-info">
        <span>${author || 'Автор'}</span>
      </div>
      <div class="modal-post-title">${title || ''}</div>
      <hr style="border-color:#2a2a30; margin:15px 0;">
      <div id="commentsContainer">Загрузка комментариев...</div>
    `;
  }

  const postModal = document.getElementById("postModal");
  if (postModal) postModal.classList.add("active");
  document.body.style.overflow = "hidden";

  // Загрузка комментариев (с безопасной проверкой JSON)
  try {
    const res = await fetch('/post/' + displayId, { headers: { 'Accept': 'application/json' } });
    const contentType = res.headers.get('content-type');

    if (res.ok && contentType && contentType.includes('application/json')) {
      const data = await res.json();
      const commentsContainer = document.getElementById("commentsContainer");
      if (commentsContainer) {
        if (data.comments && data.comments.length > 0) {
          commentsContainer.innerHTML = data.comments.map(c => 
            `<div style="margin-bottom:10px;"><b>${c.author || 'Пользователь'}:</b> ${c.text}</div>`
          ).join('');
        } else {
          commentsContainer.innerHTML = '<em>Комментариев пока нет</em>';
        }
      }
    } else {
      const commentsContainer = document.getElementById("commentsContainer");
      if (commentsContainer) {
        commentsContainer.innerHTML = '<em>Комментарии доступны на странице поста</em>';
      }
    }
  } catch (e) {
    const commentsContainer = document.getElementById("commentsContainer");
    if (commentsContainer) {
      commentsContainer.innerHTML = '<em>Ошибка загрузки комментариев</em>';
    }
  }
}

// Закрытие модального окна
function closePostModal(event, force = false) {
  if (force || (event && event.target.id === "postModal")) {
    const postModal = document.getElementById("postModal");
    if (postModal) postModal.classList.remove("active");
    document.body.style.overflow = "";
    history.pushState(null, "", "/");
  }
}

// Обработка кнопки "Назад" в браузере
window.addEventListener("popstate", function () {
  const postModal = document.getElementById("postModal");
  if (postModal) postModal.classList.remove("active");
  document.body.style.overflow = "";
});
