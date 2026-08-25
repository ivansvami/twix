const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const cloudinaryClient = require('../config/cloudinary');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const PostView = require('../models/PostView');
const SuggestedVideo = require('../models/SuggestedVideo');

function hashIp(ip) {
  const salt = process.env.SESSION_SECRET || 'change_me_please';
  return crypto.createHash('sha256').update(salt + '|' + ip).digest('hex');
}

function resourceTypeFromMime(mimetype = '') {
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('image/')) return 'image';
  return null;
}

function buildDateFilter(period) {
  if (!period || period === 'all') return {};
  const now = new Date();
  const map = {
    today: 1000 * 60 * 60 * 24,
    week: 1000 * 60 * 60 * 24 * 7,
    month: 1000 * 60 * 60 * 24 * 30,
    year: 1000 * 60 * 60 * 24 * 365
  };
  const ms = map[period];
  if (!ms) return {};
  return { createdAt: { $gte: new Date(now.getTime() - ms) } };
}

function buildSort(sort) {
  switch (sort) {
    case 'views': return { views: -1 };
    case 'likes': return { likesCount: -1, createdAt: -1 };
    case 'comments': return { commentsCount: -1, createdAt: -1 };
    default: return { createdAt: -1 };
  }
}

// Ссылки на YouTube — по ним отличаем "предложенные видео" (вкладка "Видео")
// от обычных постов, загруженных через страницу "Новый пост" (вкладка "Лента").
const YOUTUBE_URL_REGEX = /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i;

// Собирает данные страницы ленты/вкладки "Видео": сама выборка постов не зависит
// от того, нужен ли в итоге полный рендер страницы или JSON для подгрузки.
async function fetchFeedPage(req, forcedCategory) {
  const isVideosTab = forcedCategory === 'video';
  const category = isVideosTab ? 'video' : (req.query.category || 'all');
  const sort = req.query.sort || 'new';
  const period = req.query.period || 'all';
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const perPage = 24;

  const filter = { ...buildDateFilter(period) };

  if (isVideosTab) {
    // Вкладка "Видео" — показываем только предложенные YouTube-ролики
    filter['files.url'] = YOUTUBE_URL_REGEX;
  } else {
    // Общая лента — обычные посты (фото/видео/аудио/альбомы), без YouTube-ссылок
    filter['files.url'] = { $not: YOUTUBE_URL_REGEX };
    if (category && category !== 'all') filter.category = category;
  }

  // Посты с типом доступа "только по ссылке" не показываются в общей ленте.
  // Используем "не равно unlisted", а не "равно public" — так старые посты,
  // у которых поля visibility ещё нет в базе, не пропадают из ленты.
  filter.visibility = { $ne: 'unlisted' };

  const showNsfw = req.user ? !!req.user.showNsfw : false;
  if (!showNsfw) filter.isNsfw = false;

  // Запрашиваем на один пост больше лимита, чтобы понять, есть ли ещё
  // страницы для автоподгрузки, не делая отдельный count-запрос.
  const rawPosts = await Post.find(filter)
    .sort(buildSort(sort))
    .skip((page - 1) * perPage)
    .limit(perPage + 1)
    .populate('author')
    .lean();

  const hasMore = rawPosts.length > perPage;
  const posts = hasMore ? rawPosts.slice(0, perPage) : rawPosts;

  return { posts, category, sort, period, page, hasMore, isVideosTab };
}

// Оптимизированная общая лента / фильтр по категории
async function renderFeed(req, res, forcedCategory) {
  const { posts, category, sort, period, page, hasMore, isVideosTab } =
    await fetchFeedPage(req, forcedCategory);

  res.render('feed', {
    posts,
    category,
    sort,
    period,
    page,
    hasMore,
    activeNav: isVideosTab ? 'videos' : 'feed'
  });
}

router.get('/', asyncHandler((req, res) => renderFeed(req, res, null)));
router.get('/videos', asyncHandler((req, res) => renderFeed(req, res, 'video')));

// JSON-эндпоинты для бесконечной подгрузки ленты и вкладки "Видео"
function renderFeedJson(forcedCategory) {
  return asyncHandler(async (req, res) => {
    const { posts, page, hasMore } = await fetchFeedPage(req, forcedCategory);
    res.set('Cache-Control', 'no-store');
    res.render('partials/post-cards', { posts }, (err, html) => {
      if (err) {
        console.error('Ошибка рендера карточек ленты:', err);
        return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
      }
      res.json({ ok: true, html, hasMore, nextPage: page + 1 });
    });
  });
}

router.get('/api/feed', renderFeedJson(null));
router.get('/api/videos', renderFeedJson('video'));

router.get('/api/cloudinary-auth', requireAuth, asyncHandler(async (req, res) => {
  try {
    res.json({ ok: true, ...cloudinaryClient.getClientAuth() });
  } catch (err) {
    console.error('Cloudinary auth error:', err);
    res.status(500).json({ ok: false, error: 'Не удалось подготовить загрузку' });
  }
}));

router.get('/new', requireAuth, (req, res) => {
  res.render('upload', { error: null });
});

router.post('/new', requireAuth, asyncHandler(async (req, res) => {
  const title = (req.body.title || '').trim() || 'untitled';

  let uploadedFiles = [];
  try {
    uploadedFiles = JSON.parse(req.body.uploadedFiles || '[]');
  } catch (_) {
    return res.status(400).render('upload', { error: 'Некорректные данные загруженных файлов' });
  }

  if (!Array.isArray(uploadedFiles) || uploadedFiles.length === 0 || uploadedFiles.length > 10) {
    return res.render('upload', { error: 'Выберите от 1 до 10 файлов' });
  }

  const files = uploadedFiles.map(file => ({
    url: String(file.url || ''),
    publicId: String(file.publicId || ''),
    resourceType: resourceTypeFromMime(String(file.mimetype || ''))
  }));

  if (files.some(file => !file.url || !file.publicId || !file.resourceType)) {
    return res.status(400).render('upload', { error: 'Некорректные данные файлов' });
  }

  // Категория определяется автоматически: несколько файлов — альбом,
  // один файл — по его типу (совпадает с resourceType: image/video/audio)
  const category = files.length > 1 ? 'album' : files[0].resourceType;

const isNsfw = req.body.isNsfw === 'on';
  const visibility = req.body.visibility === 'unlisted' ? 'unlisted' : 'public';
  const post = await Post.create({
    author: req.user._id,
    title: title,
    description: (req.body.description || '').trim(),
    category,
    visibility,
    files,
    isNsfw
  });

  res.redirect('/post/' + post.shortId);
}));

async function loadPostData(shortId, req) {
  const post = await Post.findOne({ shortId }).populate('author').lean();
  if (!post) return null;

  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  const ipHash = hashIp(ip);

  try {
    await PostView.create({ post: post._id, ipHash });
    const updated = await Post.findByIdAndUpdate(
      post._id,
      { $inc: { views: 1 } },
      { new: true }
    ).lean();
    post.views = updated.views;
  } catch (err) {
    if (err.code !== 11000) {
      console.error('Ошибка учёта просмотра:', err.message);
    }
  }

  const comments = await Comment.find({ post: post._id, parent: null })
    .populate('author').sort({ createdAt: -1 }).lean();
  for (const c of comments) {
    c.replies = await Comment.find({ parent: c._id }).populate('author').sort({ createdAt: 1 }).lean();
  }
  return { post, comments };
}

router.get('/post/:shortId', asyncHandler(async (req, res) => {
  const data = await loadPostData(req.params.shortId, req);
  if (!data) return res.status(404).render('404');
  res.render('post', data);
}));

router.get('/api/post/:shortId', asyncHandler(async (req, res) => {
  const data = await loadPostData(req.params.shortId, req);
  if (!data) return res.status(404).json({ ok: false });
  // Без этого браузер иногда отвечает на повторный запрос кэшированным
  // 304 Not Modified — а fetch() считает 304 неуспешным ответом, из-за
  // чего JS не обновляет пост в интерфейсе (например, после добавления
  // комментария), хотя на сервере он уже сохранён.
  res.set('Cache-Control', 'no-store');
  res.render('partials/post-content', { ...data, currentUser: res.locals.currentUser }, (err, html) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ ok: false });
    }
    res.json({ ok: true, html });
  });
}));

router.post('/post/:shortId/like', requireAuth, asyncHandler(async (req, res) => {
  const post = await Post.findOne({ shortId: req.params.shortId });
  if (!post) return res.status(404).json({ ok: false });
  const uid = req.user._id.toString();
  const idx = post.likes.findIndex(id => id.toString() === uid);
  let liked;
  if (idx >= 0) {
    post.likes.splice(idx, 1);
    liked = false;
  } else {
    post.likes.push(req.user._id);
    liked = true;
    if (post.author.toString() !== uid) {
      await Notification.create({ user: post.author, type: 'like', fromUser: req.user._id, post: post._id });
    }
  }
  post.likesCount = post.likes.length;
  await post.save();
  res.json({ ok: true, liked, count: post.likes.length });
}));

router.get('/post/:shortId/edit', requireAuth, async (req, res) => {
  const post = await Post.findOne({ shortId: req.params.shortId }).lean();
  if (!post) return res.status(404).render('404');
  if (post.author.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    return res.status(403).send('Вы не можете редактировать чужой пост');
  }
  res.render('edit', { post, error: null });
});

// Редактирование поста ограничено названием и описанием — категория, файлы
// и отметка NSFW больше не меняются через эту форму.
router.post('/post/:shortId/edit', requireAuth, asyncHandler(async (req, res) => {
  const wantsJson = req.get('Accept') === 'application/json';
  const post = await Post.findOne({ shortId: req.params.shortId });

  if (!post) {
    if (wantsJson) return res.status(404).json({ ok: false, error: 'Пост не найден' });
    return res.status(404).render('404');
  }
  if (post.author.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    const message = 'Вы не можете редактировать чужой пост';
    if (wantsJson) return res.status(403).json({ ok: false, error: message });
    return res.status(403).send(message);
  }

  post.title = (req.body.title || '').trim();
  post.description = (req.body.description || '').trim();
  await post.save();

  if (wantsJson) return res.json({ ok: true, shortId: post.shortId });
  res.redirect('/post/' + post.shortId);
}));

router.post('/post/:shortId/delete', requireAuth, asyncHandler(async (req, res) => {
  const post = await Post.findOne({ shortId: req.params.shortId });
  if (!post) return res.status(404).render('404');
  if (post.author.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    return res.status(403).send('Вы не можете удалить чужой пост');
  }

  await Promise.all(post.files.map(f =>
    cloudinaryClient.deleteFile(f.publicId, f.resourceType).catch(err => console.error('Cloudinary delete error:', err.message))
  ));
  await Comment.deleteMany({ post: post._id });
  await Notification.deleteMany({ post: post._id });

  const youtubeUrls = post.files
    .filter(file => file.resourceType === 'video' && /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(file.url || ''))
    .map(file => file.url);
  await SuggestedVideo.deleteMany({
    $or: [
      { post: post._id },
      ...(youtubeUrls.length ? [{ url: { $in: youtubeUrls }, submittedBy: post.author }] : [])
    ]
  });

  await post.deleteOne();

  res.redirect('/');
}));

module.exports = router;
