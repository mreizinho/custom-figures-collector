import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDUOiBJMfjHyFISy_U7rA7ldKKnoZ05QvQ',
  authDomain: 'custom-figures-collector.firebaseapp.com',
  projectId: 'custom-figures-collector',
  storageBucket: 'custom-figures-collector.firebasestorage.app',
  messagingSenderId: '725550496124',
  appId: '1:725550496124:web:6e2910da4ee2f60bcc8cf9'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const ignoredKeys = new Set(['minifig-exchange-rates', 'minifig-google-client-id']);
const nativeSetItem = Storage.prototype.setItem;
const nativeRemoveItem = Storage.prototype.removeItem;
let currentUser = null;
let remoteFingerprint = '';
let saveTimer = 0;
let stopRemoteListener = null;
let applyingRemote = false;

function collectSettings() {
  const settings = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('minifig-') && !ignoredKeys.has(key)) {
      settings[key] = localStorage.getItem(key);
    }
  }
  return settings;
}

function fingerprint(settings) {
  return JSON.stringify(Object.keys(settings).sort().map(key => [key, settings[key]]));
}

function status(message, error = false) {
  const target = document.querySelector('#firebaseStatus');
  if (!target) return;
  target.textContent = message;
  target.classList.toggle('error', error);
}

function applySettings(settings) {
  applyingRemote = true;
  try {
    const remoteKeys = new Set(Object.keys(settings || {}));
    const localKeys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('minifig-') && !ignoredKeys.has(key)) localKeys.push(key);
    }
    localKeys.filter(key => !remoteKeys.has(key)).forEach(key => nativeRemoveItem.call(localStorage, key));
    Object.entries(settings || {}).forEach(([key, value]) => {
      if (key.startsWith('minifig-') && !ignoredKeys.has(key) && typeof value === 'string') {
        nativeSetItem.call(localStorage, key, value);
      }
    });
  } finally {
    applyingRemote = false;
  }
}

async function saveNow() {
  if (!currentUser || applyingRemote) return;
  const settings = collectSettings();
  const nextFingerprint = fingerprint(settings);
  if (nextFingerprint === remoteFingerprint) return;
  await setDoc(doc(db, 'users', currentUser.uid), {
    settings,
    email: currentUser.email || '',
    updatedAt: serverTimestamp()
  }, { merge: true });
  remoteFingerprint = nextFingerprint;
  status(`Synced as ${currentUser.email || 'Google user'}.`);
}

function scheduleSave() {
  if (!currentUser || applyingRemote) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveNow().catch(error => status(`Sync failed: ${error.message}`, true)), 700);
}

Storage.prototype.setItem = function patchedSetItem(key, value) {
  nativeSetItem.call(this, key, value);
  if (this === localStorage && String(key).startsWith('minifig-') && !ignoredKeys.has(String(key))) scheduleSave();
};

Storage.prototype.removeItem = function patchedRemoveItem(key) {
  nativeRemoveItem.call(this, key);
  if (this === localStorage && String(key).startsWith('minifig-') && !ignoredKeys.has(String(key))) scheduleSave();
};

function renderAccount(user) {
  const button = document.querySelector('#firebaseAuth');
  if (!button) return;
  button.innerHTML = `<span class="material-symbols-rounded">${user ? 'logout' : 'account_circle'}</span>${user ? 'Sign out' : 'Sign in with Google'}`;
  button.setAttribute('aria-pressed', String(Boolean(user)));
  status(user ? `Synced as ${user.email || 'Google user'}.` : 'Sign in to synchronize this collection across devices.');
}

function installSettingsUi() {
  const section = document.querySelector('.google-settings');
  if (!section) return;
  section.innerHTML = `
    <h3>Google account</h3>
    <p>Your spreadsheet configuration, collection status, custom tags, colors, and preferences synchronize automatically.</p>
    <div class="google-settings-actions">
      <button type="button" id="firebaseAuth"><span class="material-symbols-rounded">account_circle</span>Sign in with Google</button>
    </div>
    <p id="firebaseStatus" class="settings-status" role="status" aria-live="polite"></p>`;
  document.querySelector('#firebaseAuth').addEventListener('click', async () => {
    try {
      if (auth.currentUser) {
        await signOut(auth);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (error) {
      const message = error.code === 'auth/popup-blocked'
        ? 'The sign-in popup was blocked. Allow popups for this site and try again.'
        : error.code === 'auth/unauthorized-domain'
          ? 'This website is not listed in Firebase Authentication authorized domains.'
          : error.message;
      status(message, true);
    }
  });
  renderAccount(auth.currentUser);
}

async function connectUser(user) {
  currentUser = user;
  renderAccount(user);
  if (stopRemoteListener) stopRemoteListener();
  stopRemoteListener = null;
  if (!user) {
    remoteFingerprint = '';
    return;
  }

  const reference = doc(db, 'users', user.uid);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists() || !snapshot.data().settings) {
    await saveNow();
  } else {
    const remoteSettings = snapshot.data().settings;
    remoteFingerprint = fingerprint(remoteSettings);
    if (fingerprint(collectSettings()) !== remoteFingerprint) {
      applySettings(remoteSettings);
      sessionStorage.setItem('minifig-firebase-restored', remoteFingerprint);
      location.reload();
      return;
    }
  }

  stopRemoteListener = onSnapshot(reference, nextSnapshot => {
    const settings = nextSnapshot.data()?.settings;
    if (!settings) return;
    const nextFingerprint = fingerprint(settings);
    if (nextFingerprint === fingerprint(collectSettings())) {
      remoteFingerprint = nextFingerprint;
      return;
    }
    remoteFingerprint = nextFingerprint;
    applySettings(settings);
    location.reload();
  }, error => status(`Sync failed: ${error.message}`, true));
}

installSettingsUi();
setPersistence(auth, browserLocalPersistence)
  .then(() => onAuthStateChanged(auth, user => connectUser(user).catch(error => status(`Sync failed: ${error.message}`, true))))
  .catch(error => status(`Sign-in persistence failed: ${error.message}`, true));
