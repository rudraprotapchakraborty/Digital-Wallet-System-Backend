const { fail } = require('../../utils/validation');

exports.upload = async function upload(image) {
  if (typeof image !== 'string' || image.length > 1024 * 1024 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    fail(400, 'Choose a JPG, PNG, WebP or GIF photo.');
  }
  const base64 = image.slice('data:image/jpeg;base64,'.length);
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 4 || !bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) {
    fail(400, 'This image could not be read.');
  }
  if (!process.env.IMGBB_API_KEY) fail(503, 'Photo uploads are unavailable.');
  try {
    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({ key: process.env.IMGBB_API_KEY, image: base64 }),
    });
    const data = await response.json();
    const url = new URL(data?.data?.display_url || data?.data?.url);
    if (response.ok && url.protocol === 'https:' && url.hostname === 'i.ibb.co') return url.href;
  } catch { /* Upstream errors must never expose credentials or photo data. */ }
  fail(502, 'The photo host could not save your picture. Please retry.');
};
