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
  document.querySelectorAll('.dictation-btn.is-active').forEach((b) => {
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

function startDictation(field, btn) {
  if (!SpeechRecognitionCtor) return;
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

function wrapField(field) {
  if (field.closest('.field-with-mic')) return;
  const wrap = document.createElement('div');
  wrap.className = 'field-with-mic';
  field.parentNode.insertBefore(wrap, field);
  wrap.appendChild(field);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dictation-btn';
  btn.setAttribute('aria-label', 'Speak to type (Hindi)');
  btn.setAttribute('aria-pressed', 'false');
  btn.title = 'Speak to type (Hindi)';
  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-4.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    startDictation(field, btn);
  });

  wrap.appendChild(btn);
}

export function bindSpeechDictation(root) {
  if (!root) return;
  ensureStatusEl();

  if (!speechSupported()) {
    let hint = root.querySelector('.dictation-hint');
    if (!hint) {
      hint = document.createElement('p');
      hint.className = 'hint dictation-hint';
      hint.textContent =
        'Voice typing: use the microphone on your Hindi keyboard (Gboard / iOS keyboard).';
      const main = root.querySelector('main') || root;
      const first = main.querySelector('.form-section');
      if (first) first.prepend(hint);
    }
    return;
  }

  let hint = root.querySelector('.dictation-hint');
  if (!hint) {
    hint = document.createElement('p');
    hint.className = 'hint dictation-hint';
    hint.textContent = 'Tap the mic beside a field to dictate in Hindi. Tap again to stop.';
    const main = root.querySelector('main') || root;
    const first = main.querySelector('.form-section');
    if (first) first.prepend(hint);
  }

  root.querySelectorAll('textarea, input[type="text"]').forEach(wrapField);
}
