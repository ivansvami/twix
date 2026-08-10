const mongoose = require('mongoose');
const crypto = require('crypto');

// Функция генерации 7-значного хэша (буквы + цифры)
function generateShortId() {
  return crypto.randomBytes(4).toString('hex').substring(0, 7);
}

const postSchema = new mongoose.Schema({
  shortId: { type: String, unique: true, default: generateShortId },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, trim: true, maxlength: 200, default: '' },
  category: { type: String, enum: ['image', 'video', 'audio', 'album'], required: true },
  files: [{ url: String, publicId: String, resourceType: String }],
  isNsfw: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  viewedBy: [{ type: String }],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  commentsCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

postSchema.index({ shortId: 1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ category: 1 });

module.exports = mongoose.model('Post', postSchema);