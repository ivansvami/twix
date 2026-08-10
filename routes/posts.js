const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const imagekit = require('../config/imagekit');
const { requireAuth } = require('../middleware/auth');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Notification = require('../models/Notification');

// Валидация разрешенных типов файлов
const fileFilter = (req, file, cb) => {
  // Разрешенные MIME-типы (включая image/webp и image/gif)
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/wav'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Неподдерживаемый формат файла. Разрешены JPEG, PNG, GIF, WEBP, MP4, WEBM, MP3, WAV.'), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: fileFilter
});

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
      category,
      files,
      isNsfw
    });
    res.redirect('/post/' + post._id);
  } catch (err) {
    console.error(err);
    res.render('upload', { error: err.message || 'Ошибка загрузки. Проверьте формат/размер файлов.' });
  }
});

// Просмотр отдельного поста с уникальным подчетом по IP
router.get('/post/:id', async (req, res) => {
  try {
    const userIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;

    // Ищем пост и увеличиваем просмотр только если этого IP еще нет в массиве viewedBy
    let post = await Post.findOneAndUpdate(
      { _id: req.params.id, viewedBy: { $ne: userIp } },
      { 
        $addToSet: { viewedBy: userIp },
        $inc: { views: 1 } 
      },
      { new: true }
    ).populate('author').lean();

    // Если IP уже был учтён раньше, просто получаем данные поста без увеличения просмотров
    if (!post) {
      post = await Post.findById(req.params.id).populate('author').lean();
    }

    if (!post) return res.status(404).render('404');

    const comments = await Comment.find({ post: post._id, parent: null })
      .populate('author').sort({ createdAt: -1 }).lean();
    for (const c of comments) {
      c.replies = await Comment.find({ parent: c._id }).populate('author').sort({ createdAt: 1 }).lean();
    }

    res.render('post', { post, comments });
  } catch (err) {
    console.error(err);
    res.status(500).render('404');
  }
});

router.post('/post/:id/like', requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.id);
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

module.exports = router;