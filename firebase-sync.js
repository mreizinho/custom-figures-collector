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
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');
const GUEST_SPREADSHEET_ID = '1rDpFScTbHWIG3TEUatUNFVX7E68CoOmcgoDRQmrlwZE';
const GUEST_SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${GUEST_SPREADSHEET_ID}/`;
const GUEST_COLLECTIONS = ['Star Wars', 'Misc'];
const ignoredKeys = new Set(['minifig-exchange-rates', 'minifig-google-client-id', 'minifig-firebase-user-id']);
const nativeSetItem = Storage.prototype.setItem;
const nativeRemoveItem = Storage.prototype.removeItem;
let currentUser = null;
let remoteFingerprint = '';
let saveTimer = 0;
let applyingRemote = false;
let settingsBaseline = null;
let pendingGoogleAccessToken = '';
let cloudSyncPaused = false;
let authStateRevision = 0;
let promptOnNextUserConnection = false;

function announceGoogleAuth(user, accessToken = '') {
  window.collectorFirebaseUser = user?.uid || '';
  window.dispatchEvent(new CustomEvent('collector-google-auth', {
    detail: { uid: user?.uid || '', accessToken }
  }));
}

function spreadsheetIdFromValue(value = '') {
  const match = String(value).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || (/^[a-zA-Z0-9_-]{20,}$/.test(String(value).trim()) ? String(value).trim() : '');
}

function normalizeSpreadsheetSettings(settings = {}) {
  const normalized = { ...settings };
  const savedUrl = normalized['minifig-spreadsheet-url'] || '';
  const spreadsheetId = spreadsheetIdFromValue(savedUrl) || spreadsheetIdFromValue(normalized['minifig-spreadsheet-id']);
  if (spreadsheetId) {
    normalized['minifig-spreadsheet-id'] = spreadsheetId;
    normalized['minifig-spreadsheet-url'] = savedUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/`;
  }
  return normalized;
}

function stageRestoredSpreadsheet(settings = {}) {
  const normalized = normalizeSpreadsheetSettings(settings);
  const spreadsheetId = normalized['minifig-spreadsheet-id'];
  if (!spreadsheetId) return;
  sessionStorage.setItem('collector-restored-spreadsheet-id', spreadsheetId);
  sessionStorage.setItem('collector-restored-spreadsheet-url', normalized['minifig-spreadsheet-url'] || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/`);
}

function collectSettings() {
  const settings = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('minifig-') && !ignoredKeys.has(key)) {
      settings[key] = localStorage.getItem(key);
    }
  }
  return normalizeSpreadsheetSettings(settings);
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
  settings = normalizeSpreadsheetSettings(settings);
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

async function saveNow(force = false) {
  const authenticatedUser = auth.currentUser || currentUser;
  if (!authenticatedUser) {
    if (force) throw new Error('Google sign-in is not active. Sign in again before uploading.');
    return;
  }
  if (applyingRemote || (cloudSyncPaused && !force)) return;
  const settings = collectSettings();
  const nextFingerprint = fingerprint(settings);
  if (!force && nextFingerprint === remoteFingerprint) return;
  await setDoc(doc(db, 'users', authenticatedUser.uid), {
    settings,
    spreadsheet: {
      id: settings['minifig-spreadsheet-id'] || '',
      url: settings['minifig-spreadsheet-url'] || ''
    },
    email: authenticatedUser.email || '',
    updatedAt: serverTimestamp()
  }, { merge: true });
  remoteFingerprint = nextFingerprint;
  status(`Synced as ${authenticatedUser.email || 'Google user'}.`);
}

function scheduleSave() {
  if (!(auth.currentUser || currentUser) || applyingRemote) return;
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
  document.querySelectorAll('[data-firebase-required]').forEach(control => { control.disabled = !user; });
  status(user ? `Synced as ${user.email || 'Google user'}.` : 'Sign in to synchronize this collection across devices.');
}

function chooseInitialSyncDirection(hasRemoteSettings) {
  let dialog = document.querySelector('#syncDirectionDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'syncDirectionDialog';
    dialog.className = 'sync-direction-dialog';
    dialog.setAttribute('aria-labelledby', 'syncDirectionTitle');
    dialog.innerHTML = `
      <div class="sync-direction-copy">
        <h2 id="syncDirectionTitle">Choose sync direction</h2>
        <p>This is the first sign-in for this Google account on this browser. Choose which settings should be kept.</p>
        <div class="sync-direction-actions">
          <button type="button" data-sync-direction="upload">
            <span class="material-symbols-rounded">cloud_upload</span>
            <span><strong>Upload</strong><small>Save this device's current settings to the cloud</small></span>
          </button>
          <button type="button" data-sync-direction="download">
            <span class="material-symbols-rounded">cloud_download</span>
            <span><strong>Download</strong><small>Replace this device's settings with the cloud copy</small></span>
          </button>
        </div>
      </div>`;
    document.body.append(dialog);
  }
  const download = dialog.querySelector('[data-sync-direction="download"]');
  download.disabled = !hasRemoteSettings;
  download.title = hasRemoteSettings ? '' : 'No cloud settings are available yet';
  dialog.querySelector('.sync-direction-copy > p').textContent = hasRemoteSettings
    ? 'This is the first sign-in for this Google account on this browser. Choose which settings should be kept.'
    : 'No cloud settings exist for this account yet. Upload this device’s current settings to begin syncing.';
  dialog.showModal();
  return new Promise(resolve => {
    dialog.oncancel = event => event.preventDefault();
    dialog.querySelectorAll('[data-sync-direction]').forEach(button => {
      button.onclick = () => {
        if (button.disabled) return;
        dialog.close();
        resolve(button.dataset.syncDirection);
      };
    });
  });
}

function installSettingsUi() {
  const pickerButton = document.querySelector('#chooseSpreadsheet');
  const spreadsheetField = document.querySelector('.settings-spreadsheet-field');
  if (pickerButton && spreadsheetField) {
    pickerButton.setAttribute('aria-label', 'Choose spreadsheet');
    pickerButton.title = 'Choose spreadsheet';
    pickerButton.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">table_view</span>';
    spreadsheetField.append(pickerButton);
  }
  const saveSpreadsheet = document.querySelector('#saveSpreadsheet');
  const saveCollections = document.querySelector('#saveCollections');
  if (saveSpreadsheet) saveSpreadsheet.hidden = true;
  if (saveCollections) saveCollections.hidden = true;
  const section = document.querySelector('.google-settings');
  if (!section) return;
  section.innerHTML = `
    <h3>Google account</h3>
    <input id="googleClientId" type="hidden">
    <button type="button" id="connectGoogle" hidden></button>
    <button type="button" id="saveGoogleClient" hidden></button>
    <button type="button" id="saveOnline" hidden></button>
    <button type="button" id="loadOnline" hidden></button>
    <button type="button" id="disconnectGoogle" hidden></button>
    <p>Use Upload to save this device’s configuration. A saved configuration is offered for download only when you sign in.</p>
    <div class="google-settings-actions settings-account-actions">
      <button type="button" id="firebaseAuth"><span class="material-symbols-rounded">account_circle</span>Sign in with Google</button>
      <button type="button" id="firebaseUpload" data-firebase-required><span class="material-symbols-rounded">cloud_upload</span>Upload</button>
      <button type="button" id="firebaseDownload" data-firebase-required><span class="material-symbols-rounded">cloud_download</span>Download</button>
    </div>
    <p id="firebaseStatus" class="settings-status" role="status" aria-live="polite"></p>`;
  let settingsFooter = document.querySelector('.settings-footer');
  if (!settingsFooter) {
    settingsFooter = document.createElement('div');
    settingsFooter.className = 'settings-footer';
    settingsFooter.innerHTML = '<button type="button" id="applySettings" disabled><span class="material-symbols-rounded">check</span>Apply</button>';
    document.querySelector('.settings-copy').append(settingsFooter);
  }
  document.querySelector('#firebaseAuth').addEventListener('click', async () => {
    try {
      if (auth.currentUser) {
        await signOut(auth);
      } else {
        promptOnNextUserConnection = true;
        const result = await signInWithPopup(auth, provider);
        pendingGoogleAccessToken = GoogleAuthProvider.credentialFromResult(result)?.accessToken || '';
        announceGoogleAuth(result.user, pendingGoogleAccessToken);
      }
    } catch (error) {
      promptOnNextUserConnection = false;
      const message = error.code === 'auth/popup-blocked'
        ? 'The sign-in popup was blocked. Allow popups for this site and try again.'
        : error.code === 'auth/unauthorized-domain'
          ? 'This website is not listed in Firebase Authentication authorized domains.'
          : error.message;
      status(message, true);
    }
  });
  document.querySelector('#firebaseUpload').addEventListener('click', async () => {
    try {
      status('Uploading this device’s settings…');
      const expectedSettings = collectSettings();
      await saveNow(true);
      const verification = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const savedSettings = settingsFromRemoteData(verification.data());
      if (!savedSettings || savedSettings['minifig-spreadsheet-id'] !== expectedSettings['minifig-spreadsheet-id'] || savedSettings['minifig-spreadsheet-url'] !== expectedSettings['minifig-spreadsheet-url']) {
        throw new Error('The spreadsheet configuration could not be verified after upload.');
      }
      status(`Uploaded spreadsheet: ${savedSettings['minifig-spreadsheet-url']}.`);
    } catch (error) {
      status(`Upload failed: ${error.message}`, true);
    }
  });
  document.querySelector('#firebaseDownload').addEventListener('click', async () => {
    try {
      status('Downloading cloud settings…');
      const snapshot = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const settings = settingsFromRemoteData(snapshot.data());
      if (!settings) return status('No cloud settings were found for this account.', true);
      remoteFingerprint = fingerprint(settings);
      stageRestoredSpreadsheet(settings);
      applySettings(settings);
      location.reload();
    } catch (error) {
      status(`Download failed: ${error.message}`, true);
    }
  });
  renderAccount(auth.currentUser);
  if (auth.currentUser) announceGoogleAuth(auth.currentUser);
}

function settingsFromRemoteData(data = {}) {
  let settings = (data.settings || data.spreadsheet?.id)
    ? Object.fromEntries(Object.entries(data.settings || {}).filter(([key]) => !ignoredKeys.has(key)))
    : null;
  if (!settings) return null;
  settings = normalizeSpreadsheetSettings(settings);
  const settingsSpreadsheetId = settings['minifig-spreadsheet-id'] || '';
  const dedicatedSpreadsheetId = spreadsheetIdFromValue(data.spreadsheet?.url) || spreadsheetIdFromValue(data.spreadsheet?.id);
  const dedicatedIsPersonal = dedicatedSpreadsheetId && dedicatedSpreadsheetId !== GUEST_SPREADSHEET_ID;
  const settingsIsPersonal = settingsSpreadsheetId && settingsSpreadsheetId !== GUEST_SPREADSHEET_ID;
  if ((!settingsSpreadsheetId || (!settingsIsPersonal && dedicatedIsPersonal)) && dedicatedSpreadsheetId) {
    settings['minifig-spreadsheet-id'] = dedicatedSpreadsheetId;
    settings['minifig-spreadsheet-url'] = data.spreadsheet.url || `https://docs.google.com/spreadsheets/d/${dedicatedSpreadsheetId}/`;
  }
  return normalizeSpreadsheetSettings(settings);
}

function confirmCloudSettingsDownload(user, settings) {
  let dialog = document.querySelector('#cloudConfigDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'cloudConfigDialog';
    dialog.className = 'sync-direction-dialog';
    dialog.setAttribute('aria-labelledby', 'cloudConfigTitle');
    dialog.innerHTML = `
      <div class="sync-direction-copy">
        <h2 id="cloudConfigTitle">Saved configuration found</h2>
        <p></p>
        <div class="sync-direction-actions">
          <button type="button" data-cloud-choice="keep">
            <span class="material-symbols-rounded">devices</span>
            <span><strong>Keep current</strong><small>Continue with the current local or demo configuration</small></span>
          </button>
          <button type="button" data-cloud-choice="download">
            <span class="material-symbols-rounded">cloud_download</span>
            <span><strong>Download</strong><small>Replace local settings with the saved cloud configuration</small></span>
          </button>
        </div>
      </div>`;
    document.body.append(dialog);
  }
  const savedSpreadsheet = settings?.['minifig-spreadsheet-url'] || settings?.['minifig-spreadsheet-id'] || 'Unknown spreadsheet';
  dialog.querySelector('p').textContent = `A saved configuration was found for ${user.email || 'this Google account'}. Spreadsheet: ${savedSpreadsheet}. Do you want to download it?`;
  const settingsDialog = document.querySelector('#settingsDialog');
  if (settingsDialog?.open) settingsDialog.close();
  dialog.showModal();
  return new Promise(resolve => {
    let settled = false;
    const finish = choice => {
      if (settled) return;
      settled = true;
      dialog.close();
      resolve(choice === 'download');
    };
    dialog.oncancel = event => {
      event.preventDefault();
      finish('keep');
    };
    dialog.querySelectorAll('[data-cloud-choice]').forEach(button => {
      button.onclick = () => finish(button.dataset.cloudChoice);
    });
  });
}

async function connectUser(user) {
  const revision = ++authStateRevision;
  const shouldOfferCloudDownload = Boolean(user && promptOnNextUserConnection);
  if (user) promptOnNextUserConnection = false;
  currentUser = user;
  cloudSyncPaused = Boolean(user);
  renderAccount(user);
  if (!user) {
    remoteFingerprint = '';
    sessionStorage.removeItem('collector-restored-spreadsheet-id');
    sessionStorage.removeItem('collector-restored-spreadsheet-url');
    announceGoogleAuth(null);
    nativeRemoveItem.call(localStorage, 'minifig-firebase-user-id');
    const guestChanged = localStorage.getItem('minifig-spreadsheet-id') !== GUEST_SPREADSHEET_ID || localStorage.getItem('minifig-collections') !== JSON.stringify(GUEST_COLLECTIONS);
    nativeSetItem.call(localStorage, 'minifig-spreadsheet-id', GUEST_SPREADSHEET_ID);
    nativeSetItem.call(localStorage, 'minifig-spreadsheet-url', GUEST_SPREADSHEET_URL);
    nativeSetItem.call(localStorage, 'minifig-collections', JSON.stringify(GUEST_COLLECTIONS));
    if (!GUEST_COLLECTIONS.includes(localStorage.getItem('minifig-collection'))) nativeSetItem.call(localStorage, 'minifig-collection', GUEST_COLLECTIONS[0]);
    if (guestChanged) location.reload();
    return;
  }

  nativeSetItem.call(localStorage, 'minifig-firebase-user-id', user.uid);
  announceGoogleAuth(user, pendingGoogleAccessToken);
  pendingGoogleAccessToken = '';
  sessionStorage.removeItem('collector-restored-spreadsheet-id');
  sessionStorage.removeItem('collector-restored-spreadsheet-url');
  if (!shouldOfferCloudDownload) {
    status(`Signed in as ${user.email || 'Google user'}.`);
    return;
  }

  const reference = doc(db, 'users', user.uid);
  const snapshot = await getDoc(reference);
  if (revision !== authStateRevision) return;
  const remoteData = snapshot.data() || {};
  const remoteSettings = settingsFromRemoteData(remoteData);
  const remoteSpreadsheetId = remoteSettings?.['minifig-spreadsheet-id'] || '';
  if (!remoteSettings || !remoteSpreadsheetId || remoteSpreadsheetId === GUEST_SPREADSHEET_ID) {
    status(`Signed in as ${user.email || 'Google user'}. No personal spreadsheet configuration is saved yet.`);
    return;
  }
  remoteFingerprint = fingerprint(remoteSettings);
  const download = await confirmCloudSettingsDownload(user, remoteSettings);
  if (revision !== authStateRevision) return;
  if (!download) {
    status(`Signed in as ${user.email || 'Google user'}. The current configuration was kept.`);
    return;
  }
  stageRestoredSpreadsheet(remoteSettings);
  applySettings(remoteSettings);
  location.reload();
}

installSettingsUi();
setPersistence(auth, browserLocalPersistence)
  .then(() => onAuthStateChanged(auth, user => connectUser(user).catch(error => status(`Sync failed: ${error.message}`, true))))
  .catch(error => status(`Sign-in persistence failed: ${error.message}`, true));
