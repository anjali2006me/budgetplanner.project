(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let signup = false;

  try {
    const mode = await DB.init();
    if (DB.initError()) BW.toast(DB.initError(), 'bad');
    $('modeNote').textContent = mode === 'supabase'
      ? 'Accounts are managed by Supabase Auth. Your data is private to your account.'
      : 'Demo mode: accounts and data are stored only in this browser. Connect Supabase in js/config.js for real accounts.';

    if (await Auth.current()) { location.replace('index.html'); return; }   // already signed in
  } catch (e) {
    showError(e.message || String(e));
  }

  function showError(t) { $('info').hidden = true; $('msg').textContent = t; $('msg').hidden = false; }
  function showInfo(t) { $('msg').hidden = true; $('info').textContent = t; $('info').hidden = false; }

  function setTab(isSignup) {
    signup = isSignup;
    $('heading').textContent = signup ? 'Create your account' : 'Welcome back';
    $('lead').textContent = signup ? 'Start tracking your money in a minute.' : 'Sign in to see your budget.';
    $('nameRow').hidden = !signup;
    $('submit').textContent = signup ? 'Create account' : 'Sign in';
    $('password').autocomplete = signup ? 'new-password' : 'current-password';
    $('msg').hidden = true; $('info').hidden = true;
  }
  document.querySelectorAll('input[name=tab]').forEach(r => r.addEventListener('change', () => setTab(r.value === 'signup')));

  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('submit');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Please wait…';
    $('msg').hidden = true; $('info').hidden = true;
    try {
      const email = $('email').value, password = $('password').value;
      if (signup) {
        const res = await Auth.signUp(email, password, $('name').value);
        if (res.needsConfirm) {
          document.querySelector('input[name=tab][value=signin]').checked = true;
          setTab(false);
          showInfo('Account created. We sent a confirmation link to ' + email.trim() + '. Confirm it, then sign in.');
          btn.disabled = false; btn.textContent = 'Sign in';
          return;
        }
      } else {
        await Auth.signIn(email, password);
      }
      location.replace('index.html');
    } catch (ex) {
      showError(ex.message || String(ex));
      btn.disabled = false; btn.textContent = label;
    }
  });
})();
