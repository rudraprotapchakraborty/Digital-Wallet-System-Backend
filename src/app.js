const express = require('express');
const cors = require('cors');
const app = express();

app.disable('x-powered-by');
const origins = process.env.CLIENT_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean);
app.use(cors({ origin: origins?.length ? origins : true }));

const json = express.json({ limit: '16kb' });

app.use((req, res, next) => req.method === 'POST' && /^\/api\/auth\/me\/avatar\/?$/i.test(req.path) ? next() : json(req, res, next));
app.get('/', (req, res) => res.send('Digital Wallet API running'));
app.use('/api/support', require('./modules/support/support.routes'));
app.use('/api/auth', require('./modules/auth/auth.routes'));
app.use('/api/wallet', require('./modules/wallet/wallet.routes'));
app.use('/api/agent', require('./modules/agent/agent.routes'));
app.use('/api/admin', require('./modules/admin/admin.routes'));
app.use((req, res) => res.status(404).json({ message: 'Endpoint not found.' }));
app.use(require('./utils/errorHandler'));

module.exports = app;
