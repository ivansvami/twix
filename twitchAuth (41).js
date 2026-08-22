const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/authorize';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TWITCH_USER_URL = 'https://api.twitch.tv/helix/users';

function getRedirectUri(req) {
  if (process.env.TWITCH_REDIRECT_URI) return process.env.TWITCH_REDIRECT_URI;
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  return `${protocol}://${req.get('host')}/login/twitch/callback`;
}

// Шаг 1: редирект пользователя на страницу авторизации Twitch
router.get('/login/twitch', (req, res) => {
  if (!process.env.TWITCH_CLIENT_ID) {
    return res.status(500).send('Вход через Twitch не настроен: отсутствует TWITCH_CLIENT_ID');
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.twitchState = state;
  req.session.twitchNext = req.query.next && req.query.next.startsWith('/') ? req.query.next : '/';

  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    redirect_uri: getRedirectUri(req),
    response_type: 'code',
    scope: 'user:read:email',
    state
  });
  res.redirect(`${TWITCH_AUTH_URL}?${params.toString()}`);
});

// Шаг 2: обработка ответа от Twitch, обмен кода на токен, получение профиля
router.get('/login/twitch/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.render('login', { error: `Twitch: ${error_description || error}`, next: '/' });
    }
    if (!code || !state || state !== req.session.twitchState) {
      return res.render('login', { error: 'Некорректный ответ от Twitch, попробуйте снова', next: '/' });
    }
    delete req.session.twitchState;

    const tokenParams = new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUri(req)
    });

    const tokenRes = await fetch(TWITCH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString()
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('Twitch token error:', tokenData);
      return res.render('login', { error: 'Не удалось получить токен Twitch', next: '/' });
    }

    const userRes = await fetch(TWITCH_USER_URL, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Client-Id': process.env.TWITCH_CLIENT_ID
      }
    });
    const userData = await userRes.json();
    const twitchUser = userData.data && userData.data[0];
    if (!twitchUser) {
      return res.render('login', { error: 'Не удалось получить профиль Twitch', next: '/' });
    }

    let user = await User.findOne({ twitchId: twitchUser.id });

    if (!user) {
      // Если email из Twitch уже используется локальным аккаунтом — привязываем Twitch к нему
      if (twitchUser.email) {
        user = await User.findOne({ email: twitchUser.email.toLowerCase() });
      }
    }

    if (!user) {
      let username = twitchUser.login;
      let suffix = 0;
      while (await User.findOne({ username })) {
        suffix += 1;
        username = `${twitchUser.login}${suffix}`;
      }
      user = new User({
        username,
        email: twitchUser.email ? twitchUser.email.toLowerCase() : undefined,
        twitchId: twitchUser.id,
        twitchLogin: twitchUser.login,
        avatarUrl: twitchUser.profile_image_url || ''
      });
      await user.save();
    } else if (!user.twitchId) {
      user.twitchId = twitchUser.id;
      user.twitchLogin = twitchUser.login;
      if (!user.avatarUrl) user.avatarUrl = twitchUser.profile_image_url || '';
      await user.save();
    }

    req.session.userId = user._id;
    const next = req.session.twitchNext || '/';
    delete req.session.twitchNext;
    res.redirect(next);
  } catch (err) {
    console.error('Twitch OAuth error:', err);
    res.render('login', { error: 'Ошибка входа через Twitch, попробуйте ещё раз', next: '/' });
  }
});

module.exports = router;
