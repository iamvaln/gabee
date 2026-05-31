// screens-hub.jsx — Navigation screens: profile select, home, level map,
// words sub-mode pick, summary, celebration, settings, daily cap.

// =====================================================
// WELCOME — kid types name + picks avatar (first-run kid app onboarding)
// =====================================================
function Welcome({ lang, setLang, onDone, showSkeletons }) {
  const [name, setName] = React.useState('');
  const [avatarId, setAvatarId] = React.useState(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);

  const canStart = name.trim().length >= 2 && avatarId !== null;
  const beeExpr = name.trim().length >= 2
    ? (avatarId !== null ? 'celebrate' : 'correct')
    : (name.length > 0 ? 'focus' : 'idle');

  const submit = () => {
    if (!canStart) return;
    const avatar = PROFILES.find(p => p.id === avatarId);
    onDone({ ...avatar, name: name.trim() });
  };

  return (
    <div className="welcome-screen" data-screen-label="Welcome">
      <Chrome lang={lang} setLang={setLang} showWordmark />
      <div className="welcome-body">
        <div className="welcome-hero">
          <Bee size={120} expression={beeExpr} wings bob />
          <div>
            <h1>
              {lang === 'fr' ? 'Salut, moi c\'est Gabee !' : 'Hi, I\'m Gabee!'}
            </h1>
            <p>
              {lang === 'fr'
                ? 'Et toi, comment tu t\'appelles ?'
                : 'What\'s your name?'}
            </p>
          </div>
        </div>

        <form className="welcome-form" onSubmit={e => { e.preventDefault(); submit(); }}>
          <label className="welcome-field">
            <span className="welcome-step">1</span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value.slice(0, 20))}
              placeholder={lang === 'fr' ? 'Ton prénom' : 'Your first name'}
              maxLength={20}
              autoComplete="off"
              aria-label={lang === 'fr' ? 'Ton prénom' : 'Your first name'}
            />
          </label>

          <div className="welcome-avatar-block">
            <div className="welcome-avatar-label">
              <span className="welcome-step">2</span>
              <span>{lang === 'fr' ? 'Choisis ton avatar' : 'Pick your avatar'}</span>
            </div>
            <div className="welcome-avatar-grid">
              {showSkeletons ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="welcome-avatar-card" style={{ pointerEvents:'none' }}>
                    <Skeleton width={120} height={120} radius={9999} />
                  </div>
                ))
              ) : (
                PROFILES.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={`welcome-avatar-card ${avatarId === p.id ? 'selected' : ''}`}
                    onClick={() => setAvatarId(p.id)}
                    aria-pressed={avatarId === p.id}
                    aria-label={`Avatar ${p.id}`}
                  >
                    <ProfileAvatar profile={p} size={108} expression={avatarId === p.id ? 'correct' : 'idle'} />
                    {avatarId === p.id && (
                      <span className="welcome-avatar-check"><Icon name="check" size={20} /></span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          <button
            type="submit"
            className="btn large welcome-cta"
            disabled={!canStart}
          >
            {lang === 'fr' ? 'C\'est parti !' : 'Let\'s go!'}
            <Icon name="arrow-right" />
          </button>
        </form>
      </div>
    </div>
  );
}

// =====================================================
// HOME — module hub
// =====================================================
function Home({ profile, progress, lang, setLang, onModule, onSettings, onProfile, showSkeletons, variation }) {
  return (
    <div className="home-screen" data-screen-label="Home">
      <Chrome lang={lang} setLang={setLang} showWordmark profile={profile} onSettings={onSettings} hideHome />
      <div className="home-greeting">
        <Bee size={72} expression="idle" wings bob />
        <div>
          <h1>
            {COPY.greeting[lang]}, {profile.name} <span style={{ display:'inline-block', transform:'rotate(8deg)' }}>👋</span>
          </h1>
          <p>{lang === 'fr' ? 'Sur quoi tu veux travailler aujourd\'hui ?' : 'What do you want to work on today?'}</p>
        </div>
        <div className="home-stats" aria-label="progress">
          <div className="stat-chip stars">
            <Icon name="star" size={20} />
            <div className="stat-body">
              <div className="stat-num">{progress.totalStars || 0}</div>
              <div className="stat-label">{lang === 'fr' ? 'étoiles' : 'stars'}</div>
            </div>
          </div>
          <div className="stat-chip today">
            <div className="today-ring">
              <ProgressRing
                value={Math.min(1, (progress.today?.lessons || 0) / (progress.today?.targetLessons || 2))}
                size={38} stroke={5}
                color="var(--color-brand)"
                bg="rgba(32,36,46,0.12)" />
            </div>
            <div className="stat-body">
              <div className="stat-num">
                {progress.today?.lessons || 0}<span className="stat-of">/{progress.today?.targetLessons || 2}</span>
              </div>
              <div className="stat-label">
                {lang === 'fr' ? 'leçons aujourd\'hui' : 'lessons today'}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="module-grid">
        {MODULES.map(m => {
          const p = progress[m.id];
          const pct = (p?.completed || 0) / 10;
          if (showSkeletons) {
            return <div key={m.id} className="module-tile" data-module={m.id} style={{ background:'var(--surface-muted)' }}>
              <Skeleton width={56} height={56} radius={9999} />
              <div style={{ marginTop:'auto' }}><Skeleton width={120} height={24} /><div style={{height:8}}/><Skeleton width={160} height={14}/></div>
            </div>;
          }
          return (
            <button key={m.id} className="module-tile" data-module={m.id} data-screen-label={`Module: ${m.id}`} onClick={() => onModule(m.id)}>
              <div className="icon" style={{ color: m.id === 'keyboard' ? 'var(--color-ink)' : 'white' }}>{MODULE_ICONS[m.icon]}</div>
              <div className="progress-ring">
                <ProgressRing value={pct} size={36} stroke={4}
                  color={m.id === 'keyboard' ? 'var(--color-ink)' : 'rgba(255,255,255,0.95)'}
                  bg={m.id === 'keyboard' ? 'rgba(32,36,46,0.2)' : 'rgba(255,255,255,0.25)'} />
              </div>
              <div>
                <div className="label">{m.label[lang]}</div>
                <div className="sub">{m.sub[lang]} · {p?.completed || 0}/10</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================
// LEVEL MAP
// =====================================================
function LevelMap({ moduleId, profile, progress, lang, setLang, onLevel, onHome, onBack, variation }) {
  const m = MODULES.find(x => x.id === moduleId);
  const p = progress[moduleId] || { unlocked: 1, completed: 0, lessonsByLevel: {} };
  const tiles = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <div className="levelmap-screen" data-module={moduleId} data-screen-label={`LevelMap: ${moduleId}`}>
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="levelmap-hero" data-module={moduleId}>
        <Bee size={72} expression="focus" wings />
        <div>
          <h1>{m.tagline[lang]}</h1>
          <p>{p.completed}/10 {lang === 'fr' ? 'niveaux finis' : 'levels done'} · {lang === 'fr' ? 'Choisis un niveau' : 'Pick a level'}</p>
        </div>
      </div>
      <div className="level-body">
        <div className="level-grid">
          {tiles.map(n => {
            const completed = n <= p.completed;
            const unlocked = n <= p.unlocked && !completed;
            const locked = !completed && !unlocked;
            const lessonsDone = p.lessonsByLevel?.[n] || 0;
            return (
              <button key={n}
                className={`level-tile ${completed ? 'complete' : unlocked ? 'unlocked' : 'locked'}`}
                disabled={locked}
                onClick={() => !locked && onLevel(n)}
                aria-label={`${COPY.level[lang]} ${n}`}
              >
                {locked && <span className="lock"><Icon name="lock" size={16} /></span>}
                <span className="lvl-num">{n}</span>
                <span className="lvl-sub">{COPY.level[lang]}</span>
                {!locked && (
                  <div className="lesson-pips" aria-label={`${lessonsDone} of 4 lessons`}>
                    {[0,1,2,3].map(i => <span key={i} className={`pip ${i < lessonsDone ? 'done' : ''}`} />)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =====================================================
// WORDS SUB-MODE PICK
// =====================================================
function WordsSubmodePick({ profile, lang, setLang, onSub, onBack, onHome }) {
  const cards = [
    { id: 'picture', fr: 'Image → mot', en: 'Picture → word', preview: { fr: '🦊 → renard', en: '🦊 → fox' },
      tint: '#D6336C', textColor: '#FFFFFF' },
    { id: 'fill',    fr: 'Trouve le mot', en: 'Fill the blank', preview: { fr: 'Le ___ mange', en: 'The ___ eats' },
      tint: '#2A8E63', textColor: '#FFFFFF' },
    { id: 'build',   fr: 'Construis la phrase', en: 'Build a sentence', preview: { fr: 'Ana · aime · lire', en: 'Ana · likes · read' },
      tint: '#E89B3B', textColor: '#20242E' },
    { id: 'read',    fr: 'Lis et réponds', en: 'Read & answer', preview: { fr: '📖 Court texte', en: '📖 Short story' },
      tint: '#5A6FB5', textColor: '#FFFFFF' }
  ];
  return (
    <div className="submode-screen" data-module="words" data-screen-label="Words submode">
      <Chrome lang={lang} setLang={setLang} title={MODULES[1].label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom: 12 }}>
        <Bee size={56} expression="focus" wings />
        <h2 style={{ margin:0, fontSize:24, fontWeight:800 }}>
          {MODULES[1].tagline[lang]}
        </h2>
      </div>
      <div className="submode-grid">
        {cards.map(c => (
          <button
            key={c.id}
            className="submode-card"
            data-module="words"
            onClick={() => onSub(c.id)}
            style={{ '--module': c.tint, '--module-text': c.textColor }}
          >
            <div className="sub-label">{lang === 'fr' ? 'MODE' : 'MODE'}</div>
            <div className="preview"><div className="preview-text">{c.preview[lang]}</div></div>
            <div>{c[lang]}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// =====================================================
// SESSION SUMMARY
// =====================================================
function SessionSummary({ moduleId, profile, score, total, lang, setLang, onAgain, onHome, progress }) {
  const stars = Math.max(1, Math.min(3, Math.round((score / total) * 3)));
  const today = progress?.today || { stars: 0, lessons: 0, modulesTouched: [], targetLessons: 2 };
  // Award stars from this session (the session score) on top of what was already today
  const todayStars = (today.stars || 0) + score;
  const todayLessons = (today.lessons || 0) + 1;
  const modulesSet = new Set(today.modulesTouched || []);
  modulesSet.add(moduleId);
  const modulesToday = modulesSet.size;
  return (
    <div className="summary-screen" data-screen-label={`Summary: ${moduleId}`}>
      <Chrome lang={lang} setLang={setLang} showWordmark onHome={onHome} profile={profile} />
      <div className="summary-content">
        <Bee size={96} expression={score >= total - 1 ? 'celebrate' : 'correct'} wings bob />
        <div className="summary-score"><span>{score}</span><span className="total">/{total}</span></div>
        <div className="summary-stars" aria-label={`${stars} stars`}>
          {[1,2,3].map(i => (
            <span key={i} style={{ color: i <= stars ? '#FFB400' : '#E6E8EE', display:'inline-flex' }}>
              <Icon name="star" size={28} />
            </span>
          ))}
        </div>
        <p style={{ fontSize: 18, fontWeight: 700, margin: 0, maxWidth: 560, textAlign:'center' }}>
          {score >= total - 1
            ? `${COPY.bravo[lang]}, ${profile.name} ! ${lang === 'fr' ? 'Tu progresses très bien.' : 'You\'re doing great.'}`
            : `${lang === 'fr' ? 'Bien essayé' : 'Nice try'}, ${profile.name} !`}
        </p>

        <div className="today-recap">
          <div className="today-recap-label">
            {lang === 'fr' ? 'Aujourd\'hui' : 'Today'}
          </div>
          <div className="today-recap-grid">
            <div className="today-stat">
              <div className="today-stat-num" style={{ color: 'var(--color-brand)' }}>
                <Icon name="star" size={22} /> {todayStars}
              </div>
              <div className="today-stat-label">{lang === 'fr' ? 'étoiles' : 'stars'}</div>
            </div>
            <div className="today-stat">
              <div className="today-stat-num">{todayLessons}<span className="today-of">/{today.targetLessons || 2}</span></div>
              <div className="today-stat-label">{lang === 'fr' ? 'leçons' : 'lessons'}</div>
            </div>
            <div className="today-stat">
              <div className="today-stat-num">{modulesToday}<span className="today-of">/5</span></div>
              <div className="today-stat-label">{lang === 'fr' ? 'modules' : 'modules'}</div>
            </div>
          </div>
          {todayLessons >= (today.targetLessons || 2) && (
            <div className="today-recap-goal">
              <Icon name="check" size={18} /> {lang === 'fr' ? 'Objectif du jour atteint !' : 'Daily goal reached!'}
            </div>
          )}
        </div>

        <div style={{ display:'flex', gap: 16, marginTop: 4 }}>
          <button className="btn secondary large" onClick={onHome}><Icon name="home" /> {COPY.home[lang]}</button>
          <button className="btn large" onClick={onAgain}><Icon name="refresh" size={20} /> {COPY.playAgain[lang]}</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// LEVEL COMPLETE CELEBRATION
// =====================================================
function Celebration({ moduleId, profile, lang, setLang, level, onContinue }) {
  const m = MODULES.find(x => x.id === moduleId);
  return (
    <div className="celebrate-screen" data-module={moduleId} data-screen-label={`Celebration: ${moduleId} L${level}`}>
      <Confetti count={28} />
      <Bee size={180} expression="celebrate" wings bob />
      <h1>{COPY.levelDone[lang]}</h1>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 700, opacity: 0.92 }}>
        {m.label[lang]} · {COPY.level[lang]} {level}
      </p>
      <div className="badge">
        <div className="badge-icon">
          <Icon name="star" size={42} />
        </div>
        <div className="badge-title">
          {lang === 'fr' ? `Badge ${m.label.fr} L${level}` : `${m.label.en} L${level} badge`}
        </div>
        <div className="badge-sub">{lang === 'fr' ? 'Continue à apprendre !' : 'Keep learning!'}</div>
      </div>
      <button className="btn large" onClick={onContinue}>
        {lang === 'fr' ? 'Continuer' : 'Continue'} <Icon name="arrow-right" />
      </button>
    </div>
  );
}

// =====================================================
// SETTINGS
// =====================================================
function Settings({ profile, lang, setLang, audio, setAudio, onBack, onSwitchProfile, onSignOut }) {
  return (
    <div className="settings-screen" data-screen-label="Settings">
      <Chrome lang={lang} setLang={setLang} title={COPY.settings[lang]} onBack={onBack} profile={profile} />
      <div style={{ display:'flex', flexDirection:'column', gap: 12, maxWidth: 700, margin: '20px auto', width: '100%' }}>
        <div className="settings-row">
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <ProfileAvatar profile={profile} size={56} />
            <div>
              <div className="label">{profile.name}</div>
              <div className="sub">{lang === 'fr' ? 'Avatar et nom' : 'Avatar and name'}</div>
            </div>
          </div>
          <button className="btn ghost" style={{ minHeight: 44, padding: '10px 18px', fontSize:14 }}>
            {COPY.changeName[lang]}
          </button>
        </div>
        <div className="settings-row">
          <div>
            <div className="label">{lang === 'fr' ? 'Langue par défaut' : 'Default language'}</div>
            <div className="sub">{lang === 'fr' ? 'Tu peux changer à tout moment' : 'You can switch any time'}</div>
          </div>
          <div className="lang-toggle">
            <button className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>Français</button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="label">{COPY.audio[lang]}</div>
            <div className="sub">{lang === 'fr' ? 'Lit les mots à voix haute' : 'Reads words aloud'}</div>
          </div>
          <button className={`toggle ${audio ? 'on' : ''}`} onClick={() => setAudio(!audio)} aria-pressed={audio} />
        </div>
        <div className="settings-row">
          <div>
            <div className="label">{COPY.switchProfile[lang]}</div>
            <div className="sub">{lang === 'fr' ? 'Quelqu\'un d\'autre joue ?' : 'Is someone else playing?'}</div>
          </div>
          <button className="btn ghost" style={{ minHeight: 44, padding:'10px 18px', fontSize:14 }} onClick={onSwitchProfile}>
            {COPY.switchProfile[lang]}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// DAILY CAP
// =====================================================
function DailyCap({ profile, lang, setLang, onBack, progress }) {
  const today = progress?.today || { stars: 0, lessons: 0, modulesTouched: [], targetLessons: 2 };
  const modulesToday = (today.modulesTouched || []).length;
  return (
    <div className="daycap-screen" data-screen-label="DailyCap">
      <Chrome lang={lang} setLang={setLang} showWordmark profile={profile} onHome={onBack} />
      <div className="daycap-content">
        <Bee size={108} expression="idle" wings bob />
        <h1 style={{ fontSize: 34, fontWeight: 800, margin: 0, textAlign:'center', letterSpacing:'-0.02em' }}>
          {COPY.dailyDone[lang]}
        </h1>
        <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-muted)', margin: 0 }}>
          {COPY.tomorrow[lang]} 🐝
        </p>

        <div className="today-recap">
          <div className="today-recap-label">
            {lang === 'fr' ? 'Aujourd\'hui tu as gagné' : 'Today you earned'}
          </div>
          <div className="today-recap-grid">
            <div className="today-stat">
              <div className="today-stat-num" style={{ color: 'var(--color-brand)' }}>
                <Icon name="star" size={22} /> {today.stars || 0}
              </div>
              <div className="today-stat-label">{lang === 'fr' ? 'étoiles' : 'stars'}</div>
            </div>
            <div className="today-stat">
              <div className="today-stat-num">{today.lessons || 0}<span className="today-of">/{today.targetLessons || 2}</span></div>
              <div className="today-stat-label">{lang === 'fr' ? 'leçons' : 'lessons'}</div>
            </div>
            <div className="today-stat">
              <div className="today-stat-num">{modulesToday}<span className="today-of">/5</span></div>
              <div className="today-stat-label">{lang === 'fr' ? 'modules' : 'modules'}</div>
            </div>
          </div>
          <div className="today-recap-goal">
            <Icon name="check" size={18} /> {lang === 'fr' ? 'Objectif du jour atteint !' : 'Daily goal reached!'}
          </div>
        </div>

        <button className="btn secondary large" onClick={onBack}>
          <Icon name="home" /> {COPY.home[lang]}
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { Welcome, Home, LevelMap, WordsSubmodePick, SessionSummary, Celebration, Settings, DailyCap });
