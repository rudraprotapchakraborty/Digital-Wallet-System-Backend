function fail(statusCode, message) {
  throw Object.assign(new Error(message), { statusCode });
}

function phoneNumber(value) {
  if (typeof value !== 'string' || !/^\+?\d{7,15}$/.test(value.trim())) {
    fail(400, 'Enter a phone number with 7 to 15 digits.');
  }
  return value.trim();
}

function fullName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
    fail(400, 'Enter a name of up to 100 characters.');
  }
  return value.trim();
}

function newPassword(value) {
  if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value) > 72) {
    fail(400, 'Use a password of at least 8 characters and at most 72 bytes.');
  }
  return value;
}

function money(value) {
  if (!['number', 'string'].includes(typeof value) || !/^\d{1,10}(\.\d{1,2})?$/.test(String(value)) || Number(value) <= 0) {
    fail(400, 'Enter a positive amount with up to two decimal places.');
  }
  return Number(value);
}

function emailAddress(value) {
  if (typeof value !== 'string' || value.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) fail(400, 'Enter a valid email address.');
  return value.trim().toLowerCase();
}

module.exports = { emailAddress, fail, phoneNumber, fullName, newPassword, money };
