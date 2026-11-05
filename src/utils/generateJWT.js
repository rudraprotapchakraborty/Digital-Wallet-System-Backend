const jwt = require('jsonwebtoken');
const generateJWT = (id, role, sessionVersion = 0) => {
  return jwt.sign({ id, role, sessionVersion }, process.env.JWT_SECRET, { expiresIn: '7d' });
};
module.exports = generateJWT;
