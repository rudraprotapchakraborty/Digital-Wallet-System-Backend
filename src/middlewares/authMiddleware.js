const jwt = require('jsonwebtoken');
const User = require('../modules/user/user.model');

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return res.status(401).json({ message: 'Please sign in.' });
  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ message: 'Your session expired. Please sign in again.' });
  }
  req.user = await User.findById(claims.id);
  if (!req.user) return res.status(401).json({ message: 'Account unavailable.' });
  if ((claims.sessionVersion ?? 0) !== req.user.sessionVersion) return res.status(401).json({ message: 'Please sign in again.' });
  if (req.user.isBlocked || !req.user.isApproved) return res.status(403).json({ message: 'Account access is restricted.' });
  next();
};
