const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const Comment = require('../models/Comment');
const Post = require('../models/Post');
const Notification = require('../models/Notification');

router.post('/post/:shortId/comment', requireAuth, asyncHandler(async (req, res) => {
  const post = await Post.findOne({ shortId: req.params.shortId });
  if (!post) return res.status(404).send('Пост не найден');
  const text = (req.body.text || '').trim();
  if (!text) return res.redirect('/post/' + post.shortId);
  const parentId = req.body.parent || null;

  if (parentId) {
    const parent = await Comment.findOne({ _id: parentId, post: post._id });
    if (!parent) return res.status(400).send('Некорректный комментарий для ответа');
  }

  const comment = await Comment.create({
    post: post._id,
    author: req.user._id,
    text,
    parent: parentId
  });
  post.commentsCount += 1;
  await post.save();

  if (parentId) {
    const parent = await Comment.findById(parentId);
    if (parent && parent.author.toString() !== req.user._id.toString()) {
      await Notification.create({
        user: parent.author, type: 'reply', fromUser: req.user._id, post: post._id, comment: comment._id
      });
    }
  } else if (post.author.toString() !== req.user._id.toString()) {
    await Notification.create({
      user: post.author, type: 'comment', fromUser: req.user._id, post: post._id, comment: comment._id
    });
  }

  res.redirect('/post/' + post.shortId);
}));

router.post('/comment/:id/like', requireAuth, asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ ok: false });
  const uid = req.user._id.toString();
  const idx = comment.likes.findIndex(id => id.toString() === uid);
  let liked;
  if (idx >= 0) { comment.likes.splice(idx, 1); liked = false; }
  else { comment.likes.push(req.user._id); liked = true; }
  await comment.save();
  res.json({ ok: true, liked, count: comment.likes.length });
}));


// Редактирование комментария: только автор комментария или администратор.
router.post('/comment/:id/edit', requireAuth, asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id).populate('post');
  if (!comment) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(404).json({ ok: false, error: 'Комментарий не найден' });
    }
    return res.status(404).send('Комментарий не найден');
  }

  const uid = req.user._id.toString();
  const canEdit = comment.author.toString() === uid || !!req.user.isAdmin;
  if (!canEdit) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(403).json({ ok: false, error: 'Вы не можете редактировать этот комментарий' });
    }
    return res.status(403).send('Вы не можете редактировать этот комментарий');
  }

  const text = (req.body.text || '').trim();
  if (!text) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ ok: false, error: 'Комментарий не может быть пустым' });
    }
    return res.status(400).send('Комментарий не может быть пустым');
  }
  if (text.length > 1000) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ ok: false, error: 'Комментарий слишком длинный' });
    }
    return res.status(400).send('Комментарий слишком длинный');
  }

  comment.text = text;
  await comment.save();

  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({ ok: true, id: comment._id.toString(), text: comment.text });
  }

  res.redirect('/post/' + comment.post.shortId);
}));

// Удаление комментария. Вместе с родительским комментарием удаляются все его ответы.
router.post('/comment/:id/delete', requireAuth, asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(404).json({ ok: false, error: 'Комментарий не найден' });
    }
    return res.status(404).send('Комментарий не найден');
  }

  const uid = req.user._id.toString();
  const canDelete = comment.author.toString() === uid || !!req.user.isAdmin;
  if (!canDelete) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(403).json({ ok: false, error: 'Вы не можете удалить этот комментарий' });
    }
    return res.status(403).send('Вы не можете удалить этот комментарий');
  }

  const postId = comment.post;
  const post = await Post.findById(postId).select('shortId commentsCount').lean();
  const ids = [comment._id];
  let pending = [comment._id];

  // Поддерживаем и более глубокую вложенность, даже если сейчас интерфейс
  // визуально показывает только один уровень ответов.
  while (pending.length) {
    const children = await Comment.find({ parent: { $in: pending } })
      .select('_id')
      .lean();

    pending = children
      .map(child => child._id)
      .filter(childId => !ids.some(id => id.toString() === childId.toString()));

    ids.push(...pending);
  }

  await Comment.deleteMany({ _id: { $in: ids } });
  await Notification.deleteMany({ comment: { $in: ids } });

  if (post) {
    await Post.findByIdAndUpdate(postId, {
      $set: { commentsCount: Math.max(0, (post.commentsCount || 0) - ids.length) }
    });
  }

  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({ ok: true, deletedCount: ids.length });
  }

  if (post) return res.redirect('/post/' + post.shortId);
  res.redirect('/');
}));

module.exports = router;
