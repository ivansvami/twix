const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('register', { error: null });
});

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, password2 } = req.body;
    if (!username || !email || !password) {
      return res.render('register', { error: 'Заполните все поля' });
    }
    if (password.length < 6) {
      return res.render('register', { error: 'Пароль должен быть не короче 6 символов' });
    }
    if (password !== password2) {
      return res.render('register', { error: 'Пароли не совпадают' });
    }
    const exists = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
    if (exists) {
      return res.render('register', { error: 'Пользователь с таким именем или email уже существует' });
    }
    const user = new User({ username, email });
    await user.setPassword(password);
    await user.save();
    req.session.userId = user._id;
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('register', { error: 'Ошибка регистрации, попробуйте ещё раз' });
  }
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { error: null, next: req.query.next || '/' });
});

router.post('/login', async (req, res) => {
  try {
    const { emailOrUsername, password, next } = req.body;
    const user = await User.findOne({
      $or: [{ email: (emailOrUsername || '').toLowerCase() }, { username: emailOrUsername }]
    });
    if (!user || !(await user.checkPassword(password))) {
      return res.render('login', { error: 'Неверный логин или пароль', next: next || '/' });
    }
    req.session.userId = user._id;
    res.redirect(next && next.startsWith('/') ? next : '/');
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'Ошибка входа, попробуйте ещё раз', next: '/' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

router.post('/settings/nsfw', async (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false });
  const show = req.body.show === true || req.body.show === 'true';
  await User.findByIdAndUpdate(req.user._id, { showNsfw: show });
  res.json({ ok: true, show });
});

module.exports = router;
