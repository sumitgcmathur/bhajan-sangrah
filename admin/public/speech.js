/** Web Speech API dictation for Hindi fields (Chrome Android, Safari iOS 14.5+). */

const SpeechRecognitionCtor =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

let recognition = null;
let wantsListen = false;
let activeField = null;
let activeBtn = null;
let statusEl = null;
let lastFocusedField = null;

export function speechSupported() {
  return Boolean(SpeechRecognitionCtor);
}

export function stopDictation() {
  wantsListen = false;
  if (recognition) {
    try {
      recognition.abort();
    } catch {
      /* ignore */
    }
    recognition = null;
  }
  setListeningUi(false);
}

function ensureStatusEl() {
  if (statusEl && document.body.contains(statusEl)) return statusEl;
  statusEl = document.createElement('p');
  statusEl.className = 'dictation-status is-hidden';
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(statusEl);
  return statusEl;
}

function showStatus(msg, isError) {
  const el = ensureStatusEl();
  el.textContent = msg;
  el.classList.toggle('is-hidden', !msg);
  el.classList.toggle('is-error', Boolean(isError));
}

function setListeningUi(on) {
  document.querySelectorAll('.dictation-global.is-active').forEach((b) => {
    b.classList.remove('is-active');
    b.setAttribute('aria-pressed', 'false');
  });
  if (on && activeBtn) {
    activeBtn.classList.add('is-active');
    activeBtn.setAttribute('aria-pressed', 'true');
  }
  if (!on) showStatus('');
}

function insertAtCursor(el, text) {
  if (!text) return;
  const raw = String(text).trim();
  if (!raw) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const needsSpace =
    before.length > 0 && !/[\s\n]$/.test(before) && !/^[\s.,;:!?।॥]/.test(raw);
  const chunk = (needsSpace ? ' ' : '') + raw;
  el.value = before + chunk + after;
  const pos = before.length + chunk.length;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function getRecognition() {
  if (!SpeechRecognitionCtor) return null;
  const r = new SpeechRecognitionCtor();
  r.lang = 'hi-IN';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.continuous = !isIOS;

  r.onresult = (event) => {
    if (!activeField) return;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (!event.results[i].isFinal) continue;
      insertAtCursor(activeField, event.results[i][0].transcript);
    }
  };

  r.onerror = (event) => {
    const code = event.error || '';
    if (code === 'aborted' || code === 'no-speech') {
      if (!wantsListen) showStatus('');
      return;
    }
    wantsListen = false;
    setListeningUi(false);
    const msg =
      code === 'not-allowed'
        ? 'Microphone access denied. Allow mic for this site in browser settings.'
        : code === 'network'
          ? 'Voice input needs a network connection on this device.'
          : `Voice input error: ${code}`;
    showStatus(msg, true);
  };

  r.onend = () => {
    if (!wantsListen) {
      setListeningUi(false);
      return;
    }
    window.setTimeout(() => {
      if (!wantsListen || !recognition) return;
      try {
        recognition.start();
      } catch {
        setListeningUi(false);
        wantsListen = false;
      }
    }, isIOS ? 280 : 120);
  };

  return r;
}

function isDictationField(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.matches('textarea, input[type="text"]')) return true;
  return false;
}

function pickDictationField(root) {
  if (lastFocusedField && root.contains(lastFocusedField) && isDictationField(lastFocusedField)) {
    return lastFocusedField;
  }
  return root.querySelector(
    'textarea.hi-field, input.hi-field[type="text"], textarea, main input[type="text"]',
  );
}

function startDictation(field, btn) {
  if (!SpeechRecognitionCtor) return;
  if (!field) {
    showStatus('Tap a text field first, then tap the mic.', true);
    return;
  }
  if (activeField === field && wantsListen) {
    stopDictation();
    return;
  }
  stopDictation();
  activeField = field;
  activeBtn = btn;
  wantsListen = true;
  field.focus();
  recognition = getRecognition();
  if (!recognition) return;

  setListeningUi(true);
  showStatus(isIOS ? 'Listening… tap mic again to stop' : 'Listening… tap mic to stop');

  try {
    recognition.start();
  } catch {
    wantsListen = false;
    setListeningUi(false);
    showStatus('Could not start microphone. Try again.', true);
  }
}

export function bindSpeechDictation(root) {
  if (!root) return;
  ensureStatusEl();

  root.addEventListener(
    'focusin',
    (e) => {
      if (isDictationField(e.target)) lastFocusedField = e.target;
    },
    true,
  );

  if (!speechSupported()) return;

  const btn = root.querySelector('#dictation-global');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const main = root.querySelector('.edit-main') || root;
    startDictation(pickDictationField(main), btn);
  });
}
