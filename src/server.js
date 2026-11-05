require('dotenv').config({ quiet: true });
const app = require('./app');
const connectDB = require('./config/db');

const ready = connectDB();
if (require.main === module) {
  ready.then(() => {
    const port = process.env.PORT || 5000;
    app.listen(port, () => console.log('Wallet API listening on port ' + port + ' · database ' + require('mongoose').connection.name));
  }).catch(err => { console.error('Database startup failed:', err.name); process.exit(1); });
}

module.exports = async (req, res) => {
  try { await ready; } catch { return res.status(503).json({ message: 'Database unavailable.' }); }
  return app(req, res);
};
