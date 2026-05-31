// kid-messages.jsx — Parent → Kid message reception (honey surface).
// Bandeau appears between lessons (bottom, persistent until tapped). Reader is a
// full-screen warm overlay. The kid never sees counts or read timestamps.

// Soft "ding" — one gentle tone, tonally consistent with the correct-answer cue.
function playMsgDing() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = window.__gabeeAudio || (window.__gabeeAudio = new AC());
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const mk = (freq, t0, dur, peak) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, now + t0);
      g.gain.linearRampToValueAtTime(peak, now + t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t0 + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(now + t0); o.stop(now + t0 + dur + 0.02);
    };
    mk(880, 0, 0.5, 0.12);     // A5
    mk(1318.5, 0.1, 0.5, 0.09); // E6
  } catch (e) { /* audio may be gesture-gated; ignore */ }
}

// ---------- Bandeau ----------
function MessageBandeau({ lang, message, onTap, audio = true }) {
  React.useEffect(() => {
    if (audio) playMsgDing();
  }, [message.id]);
  return (
    <button className="msg-bandeau" onClick={onTap} aria-label={COPY.msgBandeau(message.from)[lang]}>
      <span className="mb-bee"><Bee size={34} expression="idle" wings={false} /></span>
      <span className="mb-text">{COPY.msgBandeau(message.from)[lang]} <span className="mb-heart">💛</span></span>
      <span className="mb-hint">{COPY.msgTapRead[lang]}</span>
    </button>
  );
}

// ---------- Reader ----------
function MessageReader({ lang, message, onContinue }) {
  return (
    <div className="msg-reader" data-screen-label="Message reader">
      <Bee size={120} expression="celebrate" wings bob />
      <p className="mr-body">{message.text}</p>
      <button className="btn large mr-cta" onClick={onContinue}>
        {COPY.msgContinue[lang]} <Icon name="arrow-right" />
      </button>
    </div>
  );
}

Object.assign(window, { MessageBandeau, MessageReader, playMsgDing });
