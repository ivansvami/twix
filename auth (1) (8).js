const User = require('../models/User');

async function loadUser(req, res, next) {
  res.locals.currentUser = null;
  if (req.session && req.session.userId) {
    try {
      const user = await User.findById(req.session.userId).lean();
      if (user) {
        req.user = user;
        res.locals.currentUser = user;
      }
    } catch (e) {
      // некорректный id в сессии — игнорируем
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

module.exports = { loadUser, requireAuth };
