const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const SuggestedVideo = require('../models/SuggestedVideo');

const ALLOWED_CATEGORIES = ['Смешные', 'Трукрайм', 'Разоблачения', 'Трейлеры', 'Разное'];

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
    const youtubeId = extractYoutubeId(url);
    if (!youtubeId) {
      return res.status(400).json({ ok: false, error: 'Не удалось распознать ссылку на YouTube-видео' });
    }
    const finalCategory = ALLOWED_CATEGORIES.includes(category) ? category : 'Разное';

    await SuggestedVideo.create({
      url: url.trim(),
      youtubeId,
      category: finalCategory,
      comment: (comment || '').trim().slice(0, 150),
      submittedBy: req.user._id
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Ошибка сохранения предложенного видео:', err);
    res.status(500).json({ ok: false, error: 'Ошибка сервера, попробуйте ещё раз' });
  }
});

module.exports = router;
