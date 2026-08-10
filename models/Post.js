const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, trim: true, maxlength: 200, default: '' },
  category: { type: String, enum: ['image', 'video', 'audio', 'album'], required: true },
  files: [{ url: String, publicId: String, resourceType: String }],
  isNsfw: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  commentsCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

postSchema.index({ createdAt: -1 });
postSchema.index({ category: 1 });

module.exports = mongoose.model('Post', postSchema);
