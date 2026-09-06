const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const Post = require('../models/Post');

// Те же регулярки/хелперы, что и в routes/posts.js — отличаем YouTube-ссылки
// ("Видосы"), обычные посты в ленте и посты "по ссылке" (unlisted).
const YOUTUBE_URL_REGEX = /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i;

function buildProfileFilter(authorId, tab) {
  const filter = { author: authorId };

  if (tab === 'videos') {
    // Вкладка "Видосы" — предложенные YouTube-ролики автора, вне
    // зависимости от того, как они были опубликованы.
    filter['files.url'] = YOUTUBE_URL_REGEX;
  } else if (tab === 'unlisted') {
    // Вкладка "По ссылке" — посты, опубликованные с доступом "по ссылке"
    filter['files.url'] = { $not: YOUTUBE_URL_REGEX };
    filter.visibility = 'unlisted';
  } else {
    // Вкладка "Лента" — обычные посты, опубликованные в общую ленту
    filter['files.url'] = { $not: YOUTUBE_URL_REGEX };
    filter.visibility = { $ne: 'unlisted' };
  }

  return filter;
}

// Собирает данные для одной вкладки профиля — используется и для полного
// рендера страницы, и для JSON-подгрузки (бесконечная лента).
async function fetchProfilePage(req, tab) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const perPage = 24;

  const filter = buildProfileFilter(req.user._id, tab);

  const rawPosts = await Post.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage + 1)
    .populate('author')
    .lean();

  const hasMore = rawPosts.length > perPage;
  const posts = hasMore ? rawPosts.slice(0, perPage) : rawPosts;

  return { posts, page, hasMore };
}

function renderProfilePage(tab) {
  return asyncHandler(async (req, res) => {
    const { posts, page, hasMore } = await fetchProfilePage(req, tab);
    res.render('profile', {
      posts,
      page,
      hasMore,
      activeTab: tab,
      pageTitle: 'Профиль - twix.pics'
    });
  });
}

function renderProfileJson(tab) {
  return asyncHandler(async (req, res) => {
    const { posts, page, hasMore } = await fetchProfilePage(req, tab);
    res.set('Cache-Control', 'no-store');
    res.render('partials/post-cards', { posts }, (err, html) => {
      if (err) {
        console.error('Ошибка рендера карточек профиля:', err);
        return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
      }
      res.json({ ok: true, html, hasMore, nextPage: page + 1 });
    });
  });
}

router.get('/profile', requireAuth, renderProfilePage('feed'));
router.get('/profile/unlisted', requireAuth, renderProfilePage('unlisted'));
router.get('/profile/videos', requireAuth, renderProfilePage('videos'));

router.get('/api/profile/feed', requireAuth, renderProfileJson('feed'));
router.get('/api/profile/unlisted', requireAuth, renderProfileJson('unlisted'));
router.get('/api/profile/videos', requireAuth, renderProfileJson('videos'));

module.exports = router;
