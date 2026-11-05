module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.code === 11000) return res.status(409).json({ message: 'This account identifier is already in use.' });
  if (err.name === 'CastError' || err.name === 'ValidationError') return res.status(400).json({ message: 'Check the submitted values.' });
  const status = err.statusCode || err.status || 500;
  if (status >= 500) console.error('Request failed', req.method, req.path, err.name);
  res.status(status).json({ message: status >= 500 && !err.statusCode ? 'The service could not complete your request.' : err.message });
};
