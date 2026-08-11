const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const imagekit = require('../config/imagekit');
const { requireAuth } = require('../middleware/auth');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const PostView = require('../models/PostView');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }
});

function hashIp(ip) {
  const salt = process.env.SESSION_SECRET || 'change_me_please';
  return crypto.createHash('sha256').update(salt + '|' + ip).digest('hex');
}

function resourceTypeFromMime(mimetype) {
  if (mimetype.startsWith('video')) return 'video';
  if (mimetype.startsWith('audio')) return 'audio';
  return 'image';
}

async function uploadFileToImageKit(file) {
  const result = await imagekit.upload({
    file: file.buffer.toString('base64'),
    fileName: file.originalname,
    folder: '/myfeed',
    useUniqueFileName: true
  });
  return {
    url: result.url,
    publicId: result.fileId,
    resourceType: resourceTypeFromMime(file.mimetype)
  };
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

// Общая лента / фильтр по категории
async function renderFeed(req, res, forcedCategory) {
  const category = forcedCategory || req.query.category || 'all';
  const sort = req.query.sort || 'new';
  const period = req.query.period || 'today';
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const perPage = 24;

  const filter = { ...buildDateFilter(period) };
  if (category && category !== 'all') filter.category = category;

  const showNsfw = req.user ? !!req.user.showNsfw : false;
  if (!showNsfw) filter.isNsfw = false;

  const posts = await Post.aggregate([
    { $match: filter },
    { $addFields: { likesCount: { $size: '$likes' } } },
    { $sort: buildSort(sort) },
    { $skip: (page - 1) * perPage },
    { $limit: perPage },
    { $lookup: { from: 'users', localField: 'author', foreignField: '_id', as: 'author' } },
    { $unwind: '$author' }
  ]);

  res.render('feed', {
    posts,
    category,
    sort,
    period,
    page,
    activeNav: forcedCategory === 'video' ? 'videos' : 'feed'
  });
}

router.get('/', (req, res) => renderFeed(req, res, null));
router.get('/videos', (req, res) => renderFeed(req, res, 'video'));

router.get('/new', requireAuth, (req, res) => {
  res.render('upload', { error: null });
});

router.post('/new', requireAuth, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.render('upload', { error: 'Выберите хотя бы один файл' });
    }
    const category = req.body.category || 'image';
    const isNsfw = req.body.isNsfw === 'on';
    const files = await Promise.all(req.files.map(uploadFileToImageKit));
    const post = await Post.create({
      author: req.user._id,
      title: (req.body.title || '').trim(),
      description: (req.body.description || '').trim(),
      category,
      files,
      isNsfw
    });
    res.redirect('/post/' + post.shortId);
  } catch (err) {
    console.error(err);
    res.render('upload', { error: 'Ошибка загрузки. Проверьте формат/размер файлов.' });
  }
});

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
    // код 11000 = дубликат (этот IP уже засчитан для этого поста) — просмотр не увеличиваем
  }

  const comments = await Comment.find({ post: post._id, parent: null })
    .populate('author').sort({ createdAt: -1 }).lean();
  for (const c of comments) {
    c.replies = await Comment.find({ parent: c._id }).populate('author').sort({ createdAt: 1 }).lean();
  }
  return { post, comments };
}

// Полная страница поста (для прямых ссылок / шаринга)
router.get('/post/:shortId', async (req, res) => {
  const data = await loadPostData(req.params.shortId, req);
  if (!data) return res.status(404).render('404');
  res.render('post', data);
});

// Данные поста для попапа (AJAX)
router.get('/api/post/:shortId', async (req, res) => {
  const data = await loadPostData(req.params.shortId, req);
  if (!data) return res.status(404).json({ ok: false });
  res.render('partials/post-content', { ...data, currentUser: res.locals.currentUser }, (err, html) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ ok: false });
    }
    res.json({ ok: true, html });
  });
});

router.post('/post/:shortId/like', requireAuth, async (req, res) => {
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
  await post.save();
  res.json({ ok: true, liked, count: post.likes.length });
});

router.get('/post/:shortId/edit', requireAuth, async (req, res) => {
  const post = await Post.findOne({ shortId: req.params.shortId }).lean();
  if (!post) return res.status(404).render('404');
  if (post.author.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    return res.status(403).send('Вы не можете редактировать чужой пост');
  }
  res.render('edit', { post, error: null });
});

router.post('/post/:shortId/edit', requireAuth, upload.array('newFiles', 10), async (req, res) => {
  const post = await Post.findOne({ shortId: req.params.shortId });
  if (!post) return res.status(404).render('404');
  if (post.author.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    return res.status(403).send('Вы не можете редактировать чужой пост');
  }

  try {
    post.title = (req.body.title || '').trim();
    post.description = (req.body.description || '').trim();
    post.category = req.body.category || post.category;
    post.isNsfw = req.body.isNsfw === 'on';

    // Удаляем отмеченные файлы (и в ImageKit, и из поста)
    const removeIds = [].concat(req.body.removeFiles || []);
    if (removeIds.length) {
      const toRemove = post.files.filter(f => removeIds.includes(f.publicId));
      await Promise.all(toRemove.map(f =>
        imagekit.deleteFile(f.publicId).catch(err => console.error('ImageKit delete error:', err.message))
      ));
      post.files = post.files.filter(f => !removeIds.includes(f.publicId));
    }

    // Добавляем новые файлы, если загружены
    if (req.files && req.files.length) {
      const newFiles = await Promise.all(req.files.map(uploadFileToImageKit));
      post.files.push(...newFiles);
    }

    if (post.files.length === 0) {
      return res.render('edit', { post, error: 'У поста должен остаться хотя бы один файл' });
    }

    await post.save();
    res.redirect('/post/' + post.shortId);
  } catch (err) {
    console.error(err);
    res.render('edit', { post, error: 'Ошибка сохранения. Попробуйте ещё раз.' });
  }
});

router.post('/post/:shortId/delete', requireAuth, async (req, res) => {
  const post = await Post.findOne({ shortId: req.params.shortId });
  if (!post) return res.status(404).render('404');
  if (post.author.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    return res.status(403).send('Вы не можете удалить чужой пост');
  }

  await Promise.all(post.files.map(f =>
    imagekit.deleteFile(f.publicId).catch(err => console.error('ImageKit delete error:', err.message))
  ));
  await Comment.deleteMany({ post: post._id });
  await Notification.deleteMany({ post: post._id });
  await post.deleteOne();

  res.redirect('/');
});

module.exports = router;
