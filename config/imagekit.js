const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const IMAGEKIT_API_URL = 'https://api.imagekit.io/v1/files';

function requireConfig() {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) throw new Error('IMAGEKIT_PRIVATE_KEY не задан');
  return privateKey;
}

async function upload({ file, fileName, folder = '/myfeed', useUniqueFileName = true }) {
  const privateKey = requireConfig();
  const form = new FormData();
  form.append('file', file);
  form.append('fileName', fileName);
  form.append('folder', folder);
  form.append('useUniqueFileName', String(useUniqueFileName));

  const response = await fetch(IMAGEKIT_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString('base64')}`
    },
    body: form
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.help || `ImageKit upload failed (${response.status})`);
  }
  return data;
}

async function deleteFile(fileId) {
  const privateKey = requireConfig();
  const response = await fetch(`${IMAGEKIT_API_URL}/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString('base64')}`
    }
  });

  if (!response.ok && response.status !== 404) {
    let data = {};
    try { data = await response.json(); } catch (_) {}
    throw new Error(data.message || `ImageKit delete failed (${response.status})`);
  }
}

module.exports = { upload, deleteFile };
