const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function requireConfig() {
  const { cloud_name, api_key, api_secret } = cloudinary.config();
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error('CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET не заданы');
  }
}

const UPLOAD_FOLDER = 'myfeed';

// Данные для прямой (signed) загрузки файла из браузера в Cloudinary, минуя наш сервер.
// Всё, что подписывается здесь (timestamp, folder), должно быть отправлено
// клиентом в теле запроса на загрузку один в один — иначе Cloudinary
// ответит "Invalid Signature".
function getClientAuth() {
  requireConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = { timestamp, folder: UPLOAD_FOLDER };
  const signature = cloudinary.utils.api_sign_request(paramsToSign, cloudinary.config().api_secret);

  return {
    cloudName: cloudinary.config().cloud_name,
    apiKey: cloudinary.config().api_key,
    timestamp,
    folder: UPLOAD_FOLDER,
    signature
  };
}

// В Cloudinary нет отдельного resource_type для аудио — аудиофайлы там
// тоже хранятся под resource_type 'video'.
async function deleteFile(publicId, resourceType = 'image') {
  requireConfig();
  const type = resourceType === 'audio' ? 'video' : resourceType;
  await cloudinary.uploader.destroy(publicId, { resource_type: type });
}

module.exports = { cloudinary, getClientAuth, deleteFile };
