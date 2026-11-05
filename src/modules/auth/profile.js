const User = require('../user/user.model');
const generateJWT = require('../../utils/generateJWT');
const { fail } = require('../../utils/validation');

const credentials = '+password +googleSub';
async function loadAccount(id) {
  const user = await User.findById(id).select(credentials);
  if (!user) fail(404, 'Account not found.');
  return user;
}

function profile(user) {
  return {
    id: user.id, name: user.name, phone: user.phone, role: user.role,
    email: user.email || '', avatar: user.avatar || '',
    demo: Boolean(user.demo), sharedDemo: Boolean(user.featured), hasPassword: Boolean(user.password), usesGoogle: Boolean(user.googleSub),
  };
}

function sessionResponse(user) {
  return { token: generateJWT(user._id, user.role, user.sessionVersion), role: user.role, user: profile(user) };
}

module.exports = { credentials, loadAccount, profile, sessionResponse };
