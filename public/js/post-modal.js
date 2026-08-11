// КЛИЕНТСКИЙ СКРИПТ ДЛЯ ОТКРЫТИЯ МОДАЛКИ И КОРОТКИХ ССЫЛОК (7 символов)

// Генерация 7-символьного ID (если требуется на клиенте)
function generateShortId() {
  return Math.random().toString(36).substring(2, 9);
}

// Преобразование любой YouTube-ссылки (embed, shorts, youtu.be) в прямую страницу видео
function getYouTubeWatchUrl(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  return match ? 'https://www.youtube.com/watch?v=' + match[1] : null;
}

// Открытие модалки поста
async function openPostModal(event, postId, shortId, mediaUrl, title, author) {
  // 1. Поиск ссылок во всех возможных источниках кликнутой карточки
  let candidateUrl = mediaUrl || '';

  if (event && event.target) {
    const cardLink = event.target.closest('a');
    if (cardLink && cardLink.href) {
      candidateUrl = candidateUrl || cardLink.href;
    }
    const cardElement = event.target.closest('.card');
    if (cardElement) {
      const iframe = cardElement.querySelector('iframe');
      if (iframe && iframe.src) {
        candidateUrl = iframe.src;
      }
    }
  }

  // 2. Проверка, является ли пост ролик с YouTube
  const ytWatchUrl = getYouTubeWatchUrl(candidateUrl) || getYouTubeWatchUrl(mediaUrl);

  if (ytWatchUrl) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    window.open(ytWatchUrl, '_blank'); // Переход прямо на сайт YouTube
    return;                            // Прерываем вызов модалки
  }

  if (event) event.preventDefault();

  // Берем 7-значный ID или генерируем короткий
  const displayId = shortId && shortId.length === 7 ? shortId : generateShortId();

  // Меняем URL в адресной строке без перезагрузки страницы
  history.pushState({ postId: displayId }, "", "/post/" + displayId);

  const modalMedia = document.getElementById("modalMedia");
  const modalSidebar = document.getElementById("modalSidebar");

  // Отрисовка медиа
  if (mediaUrl && (mediaUrl.endsWith('.mp4') || mediaUrl.endsWith('.webm'))) {
    modalMedia.innerHTML = `<video src="${mediaUrl}" controls autoplay loop></video>`;
  } else {
    modalMedia.innerHTML = `<img src="${mediaUrl || ''}" alt="Post Media">`;
  }

  // Отрисовка информации
  modalSidebar.innerHTML = `
    <div class="modal-author-info">
      <span>${author || 'Автор'}</span>
    </div>
    <div class="modal-post-title">${title || ''}</div>
    <hr style="border-color:#2a2a30; margin:15px 0;">
    <div id="commentsContainer">Загрузка комментариев...</div>
  `;

  document.getElementById("postModal").classList.add("active");
  document.body.style.overflow = "hidden"; // Запрет скролла основной страницы

  // Попытка загрузить данные/комментарии через API (опционально)
  try {
    const res = await fetch('/post/' + displayId, { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (data.comments) {
        document.getElementById("commentsContainer").innerHTML = data.comments.map(c => 
          `<div style="margin-bottom:10px;"><b>${c.author || 'Пользователь'}:</b> ${c.text}</div>`
        ).join('');
      }
    }
  } catch (e) {
    document.getElementById("commentsContainer").innerHTML = '<em>Комментарии недоступны</em>';
  }
}

// Закрытие модального окна
function closePostModal(event, force = false) {
  if (force || (event && event.target.id === "postModal")) {
    document.getElementById("postModal").classList.remove("active");
    document.body.style.overflow = ""; // Возвращаем скролл
    
    // Возвращаем исходный адрес ленты
    history.pushState(null, "", "/");
  }
}

// Обработка кнопки "Назад" в браузере
window.addEventListener("popstate", function () {
  document.getElementById("postModal").classList.remove("active");
  document.body.style.overflow = "";
});
