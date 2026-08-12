router.post('/api/suggest-video', requireAuth, async (req, res) => {
  try {
    const { url, category, comment } = req.body;
    const youtubeId = extractYoutubeId(url);
    if (!youtubeId) {
      return res.status(400).json({ ok: false, error: 'Не удалось распознать ссылку' });
    }

    const cleanUrl = url.trim();
    // Генерируем URL превью для YouTube
    const imageUrl = `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;

    // 1. Сохраняем в таблицу предложенных видео
    await SuggestedVideo.create({
      url: cleanUrl,
      youtubeId,
      category: ALLOWED_CATEGORIES.includes(category) ? category : 'Разное',
      comment: (comment || '').trim().slice(0, 150),
      submittedBy: req.user._id
    });

    // 2. СОЗДАЁМ ПОСТ В ОСНОВНОЙ ЛЕНТЕ
    const newPost = await Post.create({
      author: req.user._id,
      title: 'YouTube Video',
      category: 'video',
      files: [{
        url: cleanUrl,
        resourceType: 'video'
      }],
      imageUrl: imageUrl, // Добавили превью, которое часто обязательно для ленты
      isNsfw: false
    });

    console.log('Пост успешно создан в БД, ID:', newPost._id);
    res.json({ ok: true });
  } catch (err) {
    // ВАЖНО: Мы увидим настоящую ошибку базы данных в логах Vercel
    console.error('ПОДРОБНАЯ ОШИБКА СОХРАНЕНИЯ:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
