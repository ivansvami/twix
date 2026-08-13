const https = require('https');

// Функция для выполнения HTTP-запросов
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchVideoTitle(videoUrl) {
  try {
    let oEmbedUrl = '';

    // Проверяем TikTok
    if (videoUrl.includes('tiktok.com')) {
      oEmbedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
    } 
    // Проверяем YouTube (обычные видео и Shorts)
    else if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    } 
    // Проверяем Instagram Reels
    else if (videoUrl.includes('instagram.com')) {
      oEmbedUrl = `https://graph.facebook.com/v12.0/instagram_oembed?url=${encodeURIComponent(videoUrl)}&access_token=YOUR_FB_TOKEN`; // Для Insta нужен токен, либо можно пропускать
    }

    if (!oEmbedUrl) return null;

    const data = await fetchJson(oEmbedUrl);
    // oEmbed возвращает поле title (у TikTok и YouTube это название/описание видео)
    return data.title || null;
  } catch (error) {
    console.error('Не удалось автоматически получить название видео:', error);
    return null;
  }
}

module.exports = { fetchVideoTitle };
