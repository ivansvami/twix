const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const Notification = require('../models/Notification');

router.get('/notifications', requireAuth, asyncHandler(async (req, res) => {
  const list = await Notification.find({ user: req.user._id })
    .populate('fromUser').populate('post')
    .sort({ createdAt: -1 }).limit(50).lean();
  await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true });
  res.render('notifications', { list });
}));

router.get('/api/notifications/unread-count', requireAuth, asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ user: req.user._id, isRead: false });
  res.json({ count });
}));

module.exports = router;
