// sessions.jsx — Module sessions: numbers, words (4 sub-modes), keyboard, code, translation

// ---- generic shell ----
function SessionShell({ moduleId, profile, lang, setLang, onBack, onHome, beeExpression, children, current, total, lessonLabel }) {
  const m = MODULES.find(x => x.id === moduleId);
  return (
    <div className="session-screen" data-module={moduleId} data-screen-label={`Session: ${moduleId}`}>
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} beeExpression={beeExpression} profile={profile} />
      <div className="session-progress">
        <div className="dots" aria-label={`question ${current} of ${total}`}>
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} className={`dot ${i < current - 1 ? 'done' : i === current - 1 ? 'active' : ''}`} />
          ))}
        </div>
        <div className="lesson-label">{lessonLabel}</div>
      </div>
      {children}
    </div>
  );
}

function BeeAside({ expression, text }) {
  return (
    <div className="session-aside">
      <Bee size={120} expression={expression} wings bob />
      {text && <div className="bee-coach-text">{text}</div>}
    </div>
  );
}

function FeedbackOverlay({ kind, lang, onNext }) {
  if (!kind) return null;
  return (
    <div className={`feedback-strip ${kind === 'wrong' ? 'retry' : ''}`}>
      <Bee size={56} expression={kind === 'correct' ? 'correct' : 'encourage'} wings />
      <div style={{ flex: 1 }}>
        {kind === 'correct'
          ? (lang === 'fr' ? 'Bravo ! Bonne réponse.' : 'Nice — that\'s right!')
          : (lang === 'fr' ? 'Pas tout à fait. Réessaie !' : 'Not quite — try again!')}
      </div>
      <button className="btn" onClick={onNext}>
        {kind === 'correct' ? COPY.next[lang] : (lang === 'fr' ? 'Réessayer' : 'Try again')}
        <Icon name="arrow-right" />
      </button>
    </div>
  );
}

// =====================================================
// NUMBERS
// =====================================================
function NumbersSession({ profile, lang, setLang, onBack, onHome, onDone }) {
  const [qIdx, setQIdx] = React.useState(0);
  const [score, setScore] = React.useState(0);
  const [picked, setPicked] = React.useState(null);
  const [feedback, setFeedback] = React.useState(null); // 'correct' | 'wrong' | null
  const q = NUMBERS_QUESTIONS[qIdx % NUMBERS_QUESTIONS.length];

  const pick = (opt) => {
    if (feedback) return;
    setPicked(opt);
    const correct = opt === q.answer;
    setFeedback(correct ? 'correct' : 'wrong');
  };

  const next = () => {
    const wasCorrect = feedback === 'correct';
    if (wasCorrect && qIdx >= 6) { onDone(score + 1, 7); return; }
    if (!wasCorrect) { setFeedback(null); setPicked(null); return; }
    setScore(s => s + 1);
    setQIdx(i => i + 1);
    setFeedback(null);
    setPicked(null);
  };

  const beeExpr = feedback === 'correct' ? 'correct' : feedback === 'wrong' ? 'encourage' : 'focus';
  const coachText = feedback === 'correct'
    ? (lang === 'fr' ? 'Excellent !' : 'Excellent!')
    : feedback === 'wrong'
      ? (lang === 'fr' ? 'Tu peux le faire' : 'You can do it')
      : (lang === 'fr' ? 'Concentre-toi' : 'Focus');

  return (
    <SessionShell moduleId="numbers" profile={profile} lang={lang} setLang={setLang}
      onBack={onBack} onHome={onHome} beeExpression={beeExpr}
      current={qIdx + 1} total={7} lessonLabel={`L5 · ${COPY.lesson[lang]} 2`}>
      <div className="session-body">
        <div className="session-stage">
          <div className="session-prompt"><span className="big-number">{q.prompt}</span></div>
          {feedback ? (
            <FeedbackOverlay kind={feedback} lang={lang} onNext={next} />
          ) : (
            <div className="session-answers">
              {q.options.map(opt => (
                <button key={opt} className={`answer-btn ${picked === opt ? (opt === q.answer ? 'correct' : 'wrong') : ''}`}
                  onClick={() => pick(opt)}>
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
        <BeeAside expression={beeExpr} text={coachText} />
      </div>
    </SessionShell>
  );
}

// =====================================================
// WORDS — Picture → word
// =====================================================
function WordsPictureSession({ profile, lang, setLang, onBack, onHome, onDone }) {
  const [qIdx, setQIdx] = React.useState(0);
  const [score, setScore] = React.useState(0);
  const [feedback, setFeedback] = React.useState(null);
  const [picked, setPicked] = React.useState(null);
  const q = WORDS_PICTURE_QUESTIONS[lang];

  const pick = (opt) => {
    if (feedback) return;
    setPicked(opt);
    setFeedback(opt === q.answer ? 'correct' : 'wrong');
  };
  const next = () => {
    if (feedback === 'wrong') { setFeedback(null); setPicked(null); return; }
    if (qIdx >= 6) { onDone(score + 1, 7); return; }
    setScore(s => s + 1);
    setQIdx(i => i + 1);
    setFeedback(null);
    setPicked(null);
  };
  const beeExpr = feedback === 'correct' ? 'correct' : feedback === 'wrong' ? 'encourage' : 'focus';

  return (
    <SessionShell moduleId="words" profile={profile} lang={lang} setLang={setLang}
      onBack={onBack} onHome={onHome} beeExpression={beeExpr}
      current={qIdx + 1} total={7} lessonLabel={`L1 · ${lang === 'fr' ? 'Image → mot' : 'Picture → word'}`}>
      <div className="session-body">
        <div className="session-stage">
          <div className="session-prompt" style={{ padding: 16 }}>
            <div className="picture-frame">{q.emoji}</div>
          </div>
          {feedback ? <FeedbackOverlay kind={feedback} lang={lang} onNext={next} /> : (
            <div className="session-answers" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {q.options.map(opt => (
                <button key={opt} className={`answer-btn ${picked === opt ? (opt === q.answer ? 'correct' : 'wrong') : ''}`}
                  onClick={() => pick(opt)} style={{ fontSize: 26 }}>
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
        <BeeAside expression={beeExpr} text={lang === 'fr' ? 'Quel animal ?' : 'Which animal?'} />
      </div>
    </SessionShell>
  );
}

// =====================================================
// WORDS — Fill the blank
// =====================================================
function WordsFillSession({ profile, lang, setLang, onBack, onHome, onDone }) {
  const [qIdx, setQIdx] = React.useState(0);
  const [score, setScore] = React.useState(0);
  const [picked, setPicked] = React.useState(null);
  const [feedback, setFeedback] = React.useState(null);
  const q = WORDS_FILL_QUESTIONS[lang];
  const pick = (w) => {
    if (feedback) return;
    setPicked(w);
    setFeedback(w === q.answer ? 'correct' : 'wrong');
  };
  const next = () => {
    if (feedback === 'wrong') { setFeedback(null); setPicked(null); return; }
    if (qIdx >= 6) { onDone(score + 1, 7); return; }
    setScore(s => s + 1); setQIdx(i => i + 1); setFeedback(null); setPicked(null);
  };
  const beeExpr = feedback === 'correct' ? 'correct' : feedback === 'wrong' ? 'encourage' : 'focus';

  return (
    <SessionShell moduleId="words" profile={profile} lang={lang} setLang={setLang}
      onBack={onBack} onHome={onHome} beeExpression={beeExpr}
      current={qIdx + 1} total={7} lessonLabel={`L4 · ${lang === 'fr' ? 'Trouve le mot' : 'Fill the blank'}`}>
      <div className="session-body">
        <div className="session-stage">
          <div className="session-prompt">
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.01em', textAlign:'center', lineHeight: 1.3 }}>
              {q.sentence.map((w, i) => (
                <span key={i}>
                  {w === '___' ? (
                    <span style={{ display:'inline-block', minWidth: 140, borderBottom:'4px solid var(--module-words)', margin:'0 8px', color: picked ? 'var(--module-words)' : 'transparent' }}>
                      {picked || '___'}
                    </span>
                  ) : <span>{w}</span>}
                  {i < q.sentence.length - 1 ? ' ' : ''}
                </span>
              ))}
            </div>
          </div>
          {feedback ? <FeedbackOverlay kind={feedback} lang={lang} onNext={next} /> : (
            <div className="session-answers" style={{ gridTemplateColumns:`repeat(${q.options.length}, 1fr)` }}>
              {q.options.map(opt => (
                <button key={opt} className={`answer-btn ${picked === opt ? (opt === q.answer ? 'correct' : 'wrong') : ''}`}
                  onClick={() => pick(opt)} style={{ fontSize: 26 }}>
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
        <BeeAside expression={beeExpr} text={lang === 'fr' ? 'Quel mot manque ?' : 'Which word fits?'} />
      </div>
    </SessionShell>
  );
}

// =====================================================
// WORDS — Build the sentence
// =====================================================
function WordsBuildSession({ profile, lang, setLang, onBack, onHome, onDone }) {
  const q = WORDS_BUILD_QUESTIONS[lang];
  const shuffled = React.useMemo(() => {
    const arr = [...q.words];
    // Lightly shuffled (deterministic-ish)
    return [arr[2], arr[0], arr[4], arr[3], arr[1]];
  }, [q]);
  const [placed, setPlaced] = React.useState([]);
  const [feedback, setFeedback] = React.useState(null);

  const place = (w, idx) => {
    if (feedback) return;
    setPlaced(p => [...p, { w, idx }]);
  };
  const remove = (slotIdx) => {
    if (feedback) return;
    setPlaced(p => p.filter((_, i) => i !== slotIdx));
  };

  React.useEffect(() => {
    if (placed.length === q.words.length) {
      const built = placed.map(p => p.w).join(' ');
      setFeedback(built === q.target ? 'correct' : 'wrong');
    }
  }, [placed, q]);

  const reset = () => { setPlaced([]); setFeedback(null); };
  const beeExpr = feedback === 'correct' ? 'correct' : feedback === 'wrong' ? 'encourage' : 'focus';

  return (
    <SessionShell moduleId="words" profile={profile} lang={lang} setLang={setLang}
      onBack={onBack} onHome={onHome} beeExpression={beeExpr}
      current={3} total={7} lessonLabel={`L3 · ${lang === 'fr' ? 'Construis la phrase' : 'Build the sentence'}`}>
      <div className="session-body">
        <div className="session-stage">
          <div className="session-prompt" style={{ padding: 24, flexDirection:'column', gap: 18, display:'flex' }}>
            <div className="sentence-tray">
              {placed.length === 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>
                {lang === 'fr' ? '↓ Mets les mots en ordre' : '↓ Tap the words in order'}
              </span>}
              {placed.map((p, i) => (
                <span key={i} className="word-chip" onClick={() => remove(i)} style={{ borderColor: 'var(--module-words)', color: 'var(--module-words)', cursor:'pointer' }}>{p.w}</span>
              ))}
            </div>
            <div className="word-chips">
              {shuffled.map((w, i) => {
                const used = placed.find(p => p.idx === i);
                return (
                  <button key={i} className={`word-chip ${used ? 'placed' : ''}`} disabled={!!used || !!feedback}
                    onClick={() => place(w, i)}>{w}</button>
                );
              })}
            </div>
          </div>
          {feedback && (
            <FeedbackOverlay kind={feedback} lang={lang} onNext={feedback === 'correct' ? () => onDone(7, 7) : reset} />
          )}
        </div>
        <BeeAside expression={beeExpr} text={lang === 'fr' ? 'Dans le bon ordre' : 'In the right order'} />
      </div>
    </SessionShell>
  );
}

// =====================================================
// KEYBOARD
// =====================================================
function KeyboardSession({ profile, lang, setLang, onBack, onHome, onDone, audio }) {
  const targetWord = lang === 'fr' ? 'soleil' : 'sunshine';
  const [typed, setTyped] = React.useState('');
  const [feedback, setFeedback] = React.useState(null);
  const [errors, setErrors] = React.useState(0);

  React.useEffect(() => {
    const onKey = (e) => {
      if (feedback) return;
      const key = e.key.toLowerCase();
      if (key.length !== 1 && key !== 'backspace') return;
      if (key === 'backspace') { setTyped(t => t.slice(0, -1)); return; }
      const expected = targetWord[typed.length];
      if (!expected) return;
      if (key === expected.toLowerCase()) {
        setTyped(t => t + key);
        if (typed.length + 1 === targetWord.length) setFeedback('correct');
      } else {
        setErrors(e => e + 1);
        // visual flash via CSS would be nice; just don't add character
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [typed, feedback, targetWord]);

  const next = () => onDone(7, 7);
  const beeExpr = feedback === 'correct' ? 'correct' : errors > 0 ? 'encourage' : 'focus';

  const KEYS = lang === 'fr'
    ? ['azertyuiop'.split(''), 'qsdfghjklm'.split(''), 'wxcvbn'.split('')]
    : ['qwertyuiop'.split(''), 'asdfghjkl'.split(''), 'zxcvbnm'.split('')];

  const nextKey = targetWord[typed.length]?.toLowerCase();

  return (
    <SessionShell moduleId="keyboard" profile={profile} lang={lang} setLang={setLang}
      onBack={onBack} onHome={onHome} beeExpression={beeExpr}
      current={1} total={7} lessonLabel={`L5 · ${lang === 'fr' ? 'Mots longs' : 'Longer words'}`}>
      <div className="session-body" style={{ gridTemplateColumns: '1fr' }}>
        <div className="session-stage">
          <div className="session-prompt" style={{ flexDirection: 'column', gap: 16, padding: 28 }}>
            <div style={{ display:'flex', alignItems:'center', gap: 20 }}>
              <Bee size={80} expression={beeExpr} wings />
              {audio && (
                <button className="icon-btn" aria-label="play sound" style={{ background:'var(--module-keyboard)', borderColor:'var(--module-keyboard)', color:'var(--color-ink)' }}>
                  <Icon name="sound" />
                </button>
              )}
              <div className="kb-target">
                {targetWord.split('').map((c, i) => (
                  <span key={i} className={i < typed.length ? 'typed' : i === typed.length ? 'next' : 'rest'}>{c}</span>
                ))}
              </div>
            </div>
            {/* On-screen keyboard */}
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop: 12 }}>
              {KEYS.map((row, ri) => (
                <div key={ri} style={{ display:'flex', justifyContent:'center', gap: 6, marginLeft: ri * 18 }}>
                  {row.map(k => (
                    <div key={k} className={`kb-key ${k === nextKey ? 'next' : ''}`} style={{ width: 44, height: 44 }}>
                      {k.toUpperCase()}
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'center', marginTop: 4 }}>
                <div className="kb-key" style={{ width: 220, height: 38 }}>{lang === 'fr' ? 'espace' : 'space'}</div>
              </div>
            </div>
            <div style={{ fontWeight:700, color:'var(--text-muted)', marginTop: 8, fontSize: 14 }}>
              {lang === 'fr' ? 'Tape sur ton clavier' : 'Type on your keyboard'} · ⌨︎
            </div>
          </div>
          {feedback && <FeedbackOverlay kind={feedback} lang={lang} onNext={next} />}
        </div>
      </div>
    </SessionShell>
  );
}

// =====================================================
// CODE
// =====================================================
function CodeSession({ profile, lang, setLang, onBack, onHome, onDone }) {
  // 5x5 grid; bee starts at (0,4), goal at (4,0). Obstacles at (2,2) and (3,3).
  const [program, setProgram] = React.useState([]);
  const [feedback, setFeedback] = React.useState(null);
  const [running, setRunning] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 4, dir: 'right' });

  const blocks = [
    { id: 'right', label: lang === 'fr' ? 'Droite' : 'Right', icon: 'arrow-right-i' },
    { id: 'left',  label: lang === 'fr' ? 'Gauche' : 'Left',  icon: 'arrow-left-i' },
    { id: 'up',    label: lang === 'fr' ? 'Haut' : 'Up',     icon: 'arrow-up' },
    { id: 'down',  label: lang === 'fr' ? 'Bas' : 'Down',    icon: 'arrow-down' },
    { id: 'loop',  label: lang === 'fr' ? 'Répète 2×' : 'Repeat 2×', icon: 'loop', loop: true }
  ];

  const add = (b) => { if (running || feedback) return; setProgram(p => [...p, b]); };
  const removeAt = (i) => { if (running || feedback) return; setProgram(p => p.filter((_, idx) => idx !== i)); };

  const run = async () => {
    // Simulated step-through (visual only — verify by sequence)
    const expanded = [];
    program.forEach(b => {
      if (b.id === 'loop') {
        // following block is repeated
      } else expanded.push(b);
    });
    setRunning(true);
    // For demo: if program contains right×4 then up×4 → success
    let cur = { x: 0, y: 4, dir: 'right' };
    let success = false;
    const flat = [];
    program.forEach((b, i) => {
      if (b.id === 'loop') {
        const nxt = program[i+1];
        if (nxt) { flat.push(nxt); flat.push(nxt); }
      } else if (program[i-1]?.id !== 'loop') {
        flat.push(b);
      } else {
        // already pushed by loop
      }
    });

    for (const step of flat) {
      await new Promise(r => setTimeout(r, 380));
      cur = { ...cur };
      if (step.id === 'right') cur.x = Math.min(4, cur.x + 1);
      if (step.id === 'left')  cur.x = Math.max(0, cur.x - 1);
      if (step.id === 'up')    cur.y = Math.max(0, cur.y - 1);
      if (step.id === 'down')  cur.y = Math.min(4, cur.y + 1);
      setPos({ ...cur });
      if (cur.x === 4 && cur.y === 0) { success = true; break; }
    }
    await new Promise(r => setTimeout(r, 280));
    setRunning(false);
    setFeedback(success ? 'correct' : 'wrong');
  };

  const reset = () => { setProgram([]); setFeedback(null); setPos({ x: 0, y: 4, dir: 'right' }); };
  const beeExpr = feedback === 'correct' ? 'celebrate' : feedback === 'wrong' ? 'encourage' : running ? 'focus' : 'idle';

  return (
    <SessionShell moduleId="code" profile={profile} lang={lang} setLang={setLang}
      onBack={onBack} onHome={onHome} beeExpression={beeExpr}
      current={1} total={7} lessonLabel={`L4 · ${lang === 'fr' ? 'Obstacles' : 'Obstacles'}`}>
      <div className="session-body" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="session-stage">
          <div className="session-prompt" style={{ background: 'transparent', padding: 0 }}>
            <div className="code-grid">
              {Array.from({ length: 25 }).map((_, i) => {
                const x = i % 5, y = Math.floor(i / 5);
                const isRock = (x === 2 && y === 2) || (x === 3 && y === 3);
                const isGoal = x === 4 && y === 0;
                const hasBee = pos.x === x && pos.y === y;
                return (
                  <div key={i} className={`code-cell ${isRock ? 'rock' : ''} ${isGoal ? 'goal' : ''}`}>
                    {hasBee ? <Bee size={36} expression={beeExpr} wings /> : isGoal ? <Icon name="star" size={28} /> : isRock ? '🪨' : ''}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="session-stage">
          <div style={{ display:'flex', flexDirection:'column', gap: 12 }}>
            <div style={{ fontWeight:800, fontSize:14, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
              {lang === 'fr' ? 'Programme' : 'Program'}
            </div>
            <div className="code-blocks">
              {program.length === 0 && <span style={{ color:'var(--text-muted)', fontWeight:700, fontSize:14 }}>
                {lang === 'fr' ? '↓ Ajoute des blocs' : '↓ Add blocks'}
              </span>}
              {program.map((b, i) => (
                <span key={i} className={`code-block ${b.loop ? 'loop' : ''}`} onClick={() => removeAt(i)} style={{ cursor:'pointer' }}>
                  <Icon name={b.icon} size={14} /> {b.label}
                </span>
              ))}
            </div>
            <div style={{ fontWeight:800, fontSize:14, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop: 8 }}>
              {lang === 'fr' ? 'Blocs' : 'Blocks'}
            </div>
            <div className="code-palette">
              {blocks.map(b => (
                <span key={b.id} className={`code-block ${b.loop ? 'loop' : ''}`} onClick={() => add(b)}>
                  <Icon name={b.icon} size={14} /> {b.label}
                </span>
              ))}
            </div>
            {feedback ? (
              <FeedbackOverlay kind={feedback} lang={lang} onNext={feedback === 'correct' ? () => onDone(7, 7) : reset} />
            ) : (
              <div style={{ display:'flex', gap: 10, marginTop: 10 }}>
                <button className="btn ghost" onClick={reset}><Icon name="refresh" size={18} /> {lang === 'fr' ? 'Effacer' : 'Clear'}</button>
                <button className="btn" onClick={run} disabled={!program.length || running}>
                  <Icon name="play" size={16} /> {COPY.run[lang]}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </SessionShell>
  );
}

// =====================================================
// TRANSLATION
// =====================================================
function TranslationSession({ profile, lang, setLang, onBack, onHome, onDone, audio }) {
  const [qIdx, setQIdx] = React.useState(0);
  const [picked, setPicked] = React.useState(null);
  const [feedback, setFeedback] = React.useState(null);
  const [score, setScore] = React.useState(0);
  const q = TRANSLATION_QUESTIONS[qIdx % TRANSLATION_QUESTIONS.length];

  const pick = (opt) => { if (feedback) return; setPicked(opt); setFeedback(opt === q.answer ? 'correct' : 'wrong'); };
  const next = () => {
    if (feedback === 'wrong') { setFeedback(null); setPicked(null); return; }
    if (qIdx >= 6) { onDone(score + 1, 7); return; }
    setScore(s => s + 1); setQIdx(i => i + 1); setFeedback(null); setPicked(null);
  };

  const beeExpr = feedback === 'correct' ? 'correct' : feedback === 'wrong' ? 'encourage' : 'focus';

  return (
    <SessionShell moduleId="translation" profile={profile} lang={lang} setLang={setLang}
      onBack={onBack} onHome={onHome} beeExpression={beeExpr}
      current={qIdx + 1} total={7} lessonLabel={`L2 · ${q.from.toUpperCase()} → ${q.to.toUpperCase()}`}>
      <div className="session-body">
        <div className="session-stage">
          <div className="session-prompt" style={{ flexDirection: 'column', gap: 20, padding: 24 }}>
            <div className="translation-card" style={{ width: '100%', maxWidth: 520 }}>
              <span className="lang">{q.from.toUpperCase()}</span>
              <span className="text">{q.source}</span>
              {audio && (
                <button className="icon-btn" style={{ alignSelf:'center', marginTop: 8 }} aria-label="play sound">
                  <Icon name="sound" />
                </button>
              )}
            </div>
            <div style={{ fontSize: 28, fontWeight:800, color:'var(--text-muted)' }}>↓ {q.to.toUpperCase()}</div>
          </div>
          {feedback ? <FeedbackOverlay kind={feedback} lang={lang} onNext={next} /> : (
            <div className="session-answers" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {q.options.map(opt => (
                <button key={opt} className={`answer-btn ${picked === opt ? (opt === q.answer ? 'correct' : 'wrong') : ''}`}
                  onClick={() => pick(opt)}>
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
        <BeeAside expression={beeExpr} text={lang === 'fr' ? `Comment dit-on "${q.source}" en ${q.to === 'en' ? 'anglais' : 'français'} ?` : `How do you say "${q.source}" in ${q.to === 'en' ? 'English' : 'French'}?`} />
      </div>
    </SessionShell>
  );
}

Object.assign(window, {
  NumbersSession, WordsPictureSession, WordsFillSession, WordsBuildSession,
  KeyboardSession, CodeSession, TranslationSession
});
