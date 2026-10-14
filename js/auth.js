// Authentication.
//  - Supabase mode: real accounts via Supabase Auth (email + password). Sessions are kept by supabase-js.
//  - Demo mode (no Supabase): accounts live in this browser's localStorage. This is NOT secure
//    authentication, it only lets you demo the login flow and keep each user's data separate.
(function () {
  'use strict';

  const USERS_KEY = 'budgetwise.users';
  const SESSION_KEY = 'budgetwise.session';

  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'u-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  const normEmail = e => String(e || '').trim().toLowerCase();

  async function hashPw(pw, salt) {
    if (window.crypto && crypto.subtle && typeof TextEncoder !== 'undefined') {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
      return hex(bits);
    }
    let h = 5381; const s = salt + pw;            // fallback when Web Crypto is unavailable (e.g. file://)
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return 'weak-' + h.toString(16);
  }

  function validate(email, password) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
  }

  const mapSb = u => ({ id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.name) || '' });
  const sb = () => DB.client();

  const Auth = {
    async current() {
      await DB.init();
      if (sb()) {
        const { data, error } = await sb().auth.getSession();
        if (error) throw new Error(error.message);
        return data.session ? mapSb(data.session.user) : null;
      }
      const id = lsGet(SESSION_KEY, null);
      const u = id && lsGet(USERS_KEY, []).find(x => x.id === id);
      return u ? { id: u.id, email: u.email, name: u.name } : null;
    },

    // returns { user, needsConfirm }
    async signUp(email, password, name) {
      await DB.init();
      email = normEmail(email); name = String(name || '').trim();
      validate(email, password);
      if (sb()) {
        const { data, error } = await sb().auth.signUp({ email, password, options: { data: { name } } });
        if (error) throw new Error(error.message);
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          throw new Error('An account with this email already exists. Try signing in.');
        }
        return { user: data.session ? mapSb(data.user) : null, needsConfirm: !data.session };
      }
      const users = lsGet(USERS_KEY, []);
      if (users.some(u => u.email === email)) throw new Error('An account with this email already exists. Try signing in.');
      const salt = uid();
      const user = { id: uid(), email, name, salt, hash: await hashPw(password, salt) };
      users.push(user); lsSet(USERS_KEY, users); lsSet(SESSION_KEY, user.id);
      return { user: { id: user.id, email, name }, needsConfirm: false };
    },

    async signIn(email, password) {
      await DB.init();
      email = normEmail(email);
      if (!email || !password) throw new Error('Enter your email and password.');
      if (sb()) {
        const { data, error } = await sb().auth.signInWithPassword({ email, password });
        if (error) throw new Error(/confirm/i.test(error.message) ? 'Please confirm your email first (check your inbox), then sign in.' : error.message);
        return mapSb(data.user);
      }
      const u = lsGet(USERS_KEY, []).find(x => x.email === email);
      if (!u || (await hashPw(password, u.salt)) !== u.hash) throw new Error('Invalid email or password.');
      lsSet(SESSION_KEY, u.id);
      return { id: u.id, email: u.email, name: u.name };
    },

    async signOut() {
      await DB.init();
      if (sb()) { await sb().auth.signOut(); return; }
      try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    }
  };

  window.Auth = Auth;
})();
