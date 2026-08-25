// Разовый скрипт миграции: перезаливает все файлы, у которых url ещё
// указывает на ImageKit (ik.imagekit.io), в Cloudinary и обновляет ссылки
// в базе (Post.files[].url и .publicId).
//
// Auto Upload Mapping в Cloudinary сам по себе базу не трогает — это
// ленивая подгрузка "по требованию" на стороне Cloudinary, а не миграция
// данных. Поэтому старые адреса в MongoDB так и остаются, пока их явно
// не переписать — этим и занимается этот скрипт.
//
// Запуск (из корня проекта, там же где лежит server.js):
//   node scripts/migrate-imagekit-to-cloudinary.js
//
// Требует переменные окружения из .env: MONGODB_URI, CLOUDINARY_CLOUD_NAME,
// CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
// Важно: ImageKit-ссылки на момент запуска должны быть ещё доступны —
// Cloudinary их скачивает "на лету" по этому же URL.

require('dotenv').config();

const connectDB = require('../config/db');
const Post = require('../models/Post');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// В Cloudinary нет отдельного resource_type для аудио — оно тоже 'video'.
function cloudinaryResourceType(resourceType) {
  if (resourceType === 'audio') return 'video';
  if (resourceType === 'video') return 'video';
  return 'image';
}

async function migrate() {
  await connectDB();

  const posts = await Post.find({ 'files.url': { $regex: 'imagekit\\.io' } });
  console.log(`Найдено постов с файлами на ImageKit: ${posts.length}`);

  let migrated = 0;
  let failed = 0;

  for (const post of posts) {
    let changed = false;

    for (const file of post.files) {
      if (!file.url || !file.url.includes('imagekit.io')) continue;

      const oldUrl = file.url;
      try {
        console.log(`[${post.shortId}] Загружаю в Cloudinary: ${oldUrl}`);

        const result = await cloudinary.uploader.upload(oldUrl, {
          folder: 'myfeed',
          resource_type: cloudinaryResourceType(file.resourceType),
          unique_filename: true
        });

        file.url = result.secure_url;
        file.publicId = result.public_id;
        changed = true;
        migrated += 1;
      } catch (err) {
        failed += 1;
        console.error(`[${post.shortId}] Не удалось перенести ${oldUrl}:`, err.message);
      }
    }

    if (changed) {
      await post.save();
      console.log(`[${post.shortId}] Пост обновлён`);
    }
  }

  console.log(`\nГотово. Перенесено файлов: ${migrated}, ошибок: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

migrate().catch(err => {
  console.error('Ошибка миграции:', err);
  process.exit(1);
});
