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
let settingsBaseline = null;

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

async function saveNow(force = false) {
  if (!currentUser || applyingRemote) return;
  const settings = collectSettings();
  const nextFingerprint = fingerprint(settings);
  if (!force && nextFingerprint === remoteFingerprint) return;
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
    <p>Settings synchronize automatically after sign-in. Use Upload or Download only when you want one copy to replace the other.</p>
    <div class="google-settings-actions settings-account-actions">
      <button type="button" id="firebaseAuth"><span class="material-symbols-rounded">account_circle</span>Sign in with Google</button>
      <button type="button" id="firebaseUpload" data-firebase-required><span class="material-symbols-rounded">cloud_upload</span>Upload</button>
      <button type="button" id="firebaseDownload" data-firebase-required><span class="material-symbols-rounded">cloud_download</span>Download</button>
    </div>
    <p id="firebaseStatus" class="settings-status" role="status" aria-live="polite"></p>`;
  const settingsFooter = document.createElement('div');
  settingsFooter.className = 'settings-footer';
  settingsFooter.innerHTML = '<button type="button" id="applySettings" disabled><span class="material-symbols-rounded">check</span>Apply</button>';
  document.querySelector('.settings-copy').append(settingsFooter);
  const spreadsheetInput = document.querySelector('#spreadsheetUrl');
  const collectionsInput = document.querySelector('#collectionNames');
  const applyButton = document.querySelector('#applySettings');
  const currentEditableSettings = () => ({ spreadsheet: spreadsheetInput.value, collections: collectionsInput.value });
  const updateApplyState = () => {
    if (!settingsBaseline) return applyButton.disabled = true;
    const current = currentEditableSettings();
    applyButton.disabled = current.spreadsheet === settingsBaseline.spreadsheet && current.collections === settingsBaseline.collections;
  };
  [spreadsheetInput, collectionsInput].forEach(input => input.addEventListener('input', updateApplyState));
  document.querySelector('#settingsToggle').addEventListener('click', () => {
    queueMicrotask(() => {
      settingsBaseline = currentEditableSettings();
      updateApplyState();
    });
  });
  applyButton.addEventListener('click', () => {
    const spreadsheetValue = document.querySelector('#spreadsheetUrl').value.trim();
    const spreadsheetIsValid = /\/spreadsheets\/d\/[a-zA-Z0-9_-]+/.test(spreadsheetValue) || /^[a-zA-Z0-9_-]{20,}$/.test(spreadsheetValue);
    const collectionNames = document.querySelector('#collectionNames').value.split(/[\n,;]+/).map(value => value.trim()).filter(Boolean);
    if (!spreadsheetIsValid) return status('Enter a valid Google Spreadsheet URL or ID.', true);
    if (!collectionNames.length) return status('Enter at least one collection sheet name.', true);
    saveSpreadsheet.click();
    saveCollections.click();
    settingsBaseline = currentEditableSettings();
    updateApplyState();
    status('Settings applied. Changes will synchronize automatically.');
  });
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
  document.querySelector('#firebaseUpload').addEventListener('click', async () => {
    try {
      status('Uploading this device’s settings…');
      await saveNow(true);
      status('This device’s settings were uploaded.');
    } catch (error) {
      status(`Upload failed: ${error.message}`, true);
    }
  });
  document.querySelector('#firebaseDownload').addEventListener('click', async () => {
    try {
      status('Downloading cloud settings…');
      const snapshot = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const settings = snapshot.data()?.settings;
      if (!settings) return status('No cloud settings were found for this account.', true);
      remoteFingerprint = fingerprint(settings);
      applySettings(settings);
      location.reload();
    } catch (error) {
      status(`Download failed: ${error.message}`, true);
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
  const remoteSettings = snapshot.data()?.settings || null;
  const choiceKey = `collector-sync-direction-chosen:${user.uid}`;
  if (!localStorage.getItem(choiceKey)) {
    const direction = await chooseInitialSyncDirection(Boolean(remoteSettings));
    localStorage.setItem(choiceKey, direction);
    if (direction === 'upload') {
      remoteFingerprint = remoteSettings ? fingerprint(remoteSettings) : '';
      await saveNow();
    } else {
      remoteFingerprint = fingerprint(remoteSettings);
      applySettings(remoteSettings);
      location.reload();
      return;
    }
  } else if (!remoteSettings) {
    await saveNow();
  } else {
    remoteFingerprint = fingerprint(remoteSettings);
    if (fingerprint(collectSettings()) !== remoteFingerprint) {
      applySettings(remoteSettings);
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
