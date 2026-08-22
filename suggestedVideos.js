const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const SuggestedVideo = require('../models/SuggestedVideo');
const Post = require('../models/Post');

function extractYoutubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/watch\?.*&v=)([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/
  ];
  for (const re of patterns) {
    const match = url.match(re);
    if (match) return match[1];
  }
  return null;
}

router.post('/api/suggest-video', requireAuth, async (req, res) => {
  try {
    const { url, category, comment } = req.body;
    const youtubeId = extractYoutubeId((url || '').trim());
    if (!youtubeId) {
      return res.status(400).json({ ok: false, error: 'Не удалось распознать ссылку на YouTube-видео' });
    }

    const cleanUrl = url.trim();
    const imageUrl = `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;

    // Получаем настоящее название ролика с YouTube без API-ключа через oEmbed.
    // Если YouTube временно недоступен, используем безопасный запасной заголовок.
    let youtubeTitle = 'Предложенное видео';
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;
      const response = await fetch(oembedUrl, {
        headers: { 'User-Agent': 'twix-by-salonamasle/1.0' },
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const data = await response.json();
        if (typeof data.title === 'string' && data.title.trim()) {
          youtubeTitle = data.title.trim().slice(0, 200);
        }
      }
    } catch (err) {
      console.warn('Не удалось получить название YouTube-видео:', err.message);
    }

    const allowedCategories = new Set(['Смешные', 'Трукрайм', 'Разоблачения', 'Трейлеры', 'Разное']);
    const selectedCategory = allowedCategories.has(category) ? category : 'Разное';

    const post = await Post.create({
      author: req.user._id,
      title: youtubeTitle,
      description: (comment || '').trim().slice(0, 150),
      category: 'video',
      source: 'youtube',
      files: [{
        url: cleanUrl,
        publicId: youtubeId,
        resourceType: 'video'
      }],
      imageUrl: imageUrl,
      isNsfw: false
    });

    await SuggestedVideo.create({
      url: cleanUrl,
      youtubeId,
      category: selectedCategory,
      comment: (comment || '').trim().slice(0, 150),
      submittedBy: req.user._id,
      post: post._id,
      status: 'approved'
    });

    res.json({ ok: true, shortId: post.shortId });
  } catch (err) {
    console.error('Ошибка сохранения предложенного видео:', err);
    res.status(500).json({ ok: false, error: 'Ошибка сервера, попробуйте ещё раз' });
  }
});

module.exports = router;
