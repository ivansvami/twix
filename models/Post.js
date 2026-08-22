const mongoose = require('mongoose');
const crypto = require('crypto');

const SHORT_ID_CHARS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateShortId(length = 7) {
  let id = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    id += SHORT_ID_CHARS[bytes[i] % SHORT_ID_CHARS.length];
  }
  return id;
}

const postSchema = new mongoose.Schema({
  shortId: { type: String, unique: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, trim: true, maxlength: 200, default: '' },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  category: { type: String, enum: ['image', 'video', 'audio', 'album'], required: true },
  source: { type: String, enum: ['upload', 'youtube'], default: 'upload' },
  visibility: { type: String, enum: ['public', 'unlisted'], default: 'public' },
  files: [{ url: String, publicId: String, resourceType: String }],
  isNsfw: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  commentsCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

postSchema.index({ createdAt: -1 });
postSchema.index({ category: 1 });

// Генерируем уникальную короткую ссылку (7 символов) перед сохранением нового поста
postSchema.pre('save', async function (next) {
  if (this.shortId) return next();
  const Post = mongoose.model('Post');
  let candidate;
  let exists = true;
  let attempts = 0;
  while (exists && attempts < 10) {
    candidate = generateShortId(7);
    exists = await Post.exists({ shortId: candidate });
    attempts++;
  }
  if (exists) {
    return next(new Error('Не удалось сгенерировать уникальный shortId'));
  }
  this.shortId = candidate;
  next();
});
postSchema.index({ createdAt: -1 });
postSchema.index({ category: 1, createdAt: -1 });
postSchema.index({ views: -1 });
postSchema.index({ likesCount: -1 });
postSchema.index({ commentsCount: -1 });
module.exports = mongoose.model('Post', postSchema);
