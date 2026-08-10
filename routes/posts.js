// Получение поста по shortId или ObjectId
router.get('/post/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const userIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;

    // Условие поиска: проверяем и по shortId, и по стандартному _id
    const query = id.length === 7 ? { shortId: id } : { _id: id };

    let post = await Post.findOneAndUpdate(
      { ...query, viewedBy: { $ne: userIp } },
      { 
        $addToSet: { viewedBy: userIp },
        $inc: { views: 1 } 
      },
      { new: true }
    ).populate('author').lean();

    if (!post) {
      post = await Post.findOne(query).populate('author').lean();
    }

    if (!post) return res.status(404).json({ error: 'Пост не найден' });

    // Если это AJAX-запрос для модалки, отдаём JSON
    if (req.xhr || req.headers.accept?.includes('json')) {
      const comments = await Comment.find({ post: post._id, parent: null })
        .populate('author').sort({ createdAt: -1 }).lean();
      
      return res.json({ post, comments });
    }

    // Если человек зашел по прямой ссылке в браузере
    const comments = await Comment.find({ post: post._id, parent: null })
      .populate('author').sort({ createdAt: -1 }).lean();

    res.render('post', { post, comments });
  } catch (err) {
    console.error(err);
    res.status(500).render('404');
  }
});