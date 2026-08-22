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

router.post('/comment/:id/edit', requireAuth, asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ ok: false, error: 'Комментарий не найден' });
  if (comment.author.toString() !== req.user._id.toString()) {
    return res.status(403).json({ ok: false, error: 'Нет доступа' });
  }
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'Комментарий не может быть пустым' });

  comment.text = text.slice(0, 1000);
  comment.editedAt = new Date();
  await comment.save();

  res.json({ ok: true, text: comment.text });
}));

router.post('/comment/:id/delete', requireAuth, asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ ok: false, error: 'Комментарий не найден' });

  const isOwner = comment.author.toString() === req.user._id.toString();
  if (!isOwner && !req.user.isAdmin) {
    return res.status(403).json({ ok: false, error: 'Нет доступа' });
  }

  const replies = await Comment.find({ parent: comment._id });
  const removedIds = [comment._id, ...replies.map(r => r._id)];

  await Comment.deleteMany({ _id: { $in: removedIds } });
  await Post.findByIdAndUpdate(comment.post, { $inc: { commentsCount: -removedIds.length } });

  res.json({ ok: true, removedCount: removedIds.length });
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

module.exports = router;
