// app.jsx — Gabee kid app router + state + tweaks

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "beeExpression": "auto",
  "showSkeletons": false
}/*EDITMODE-END*/;

function GabeeApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [lang, setLang] = React.useState('fr');
  const [audio, setAudio] = React.useState(true);

  // Read initial route + seeded profile from URL hash (for export pages)
  // Format examples: #home, #levelmap:numbers, #session-words:5, #summary:code, #celebrate:translation, #daycap
  const parseHash = () => {
    const h = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#/, '');
    if (!h) return null;
    const [name, ...rest] = h.split(':');
    const r = { name };
    if (rest[0]) r.moduleId = rest[0];
    if (rest[1]) r.level = parseInt(rest[1], 10) || 1;
    return r;
  };
  const seededRoute = parseHash();
  const seededProfile = seededRoute ? { ...PROFILES[0], name: 'Léo' } : null;

  // Router state
  const [route, setRoute] = React.useState(seededRoute || { name: 'welcome' });
  const [profile, setProfile] = React.useState(seededProfile);
  const [progress, setProgress] = React.useState(SAMPLE_PROGRESS.rumi);
  const [lastScore, setLastScore] = React.useState({ score: 5, total: 7 });

  const nav = (r) => setRoute(r);
  // Expose for debugging / screenshot harness
  React.useEffect(() => { window.__gabee = { nav, setProfile, setLastScore, profile }; });

  const pickProfile = (p) => {
    setProfile(p);
    nav({ name: 'home' });
  };

  const goHome = () => nav({ name: 'home' });
  const goSettings = () => nav({ name: 'settings' });

  const enterModule = (id) => {
    if (id === 'words') nav({ name: 'words-sub' });
    else nav({ name: 'levelmap', moduleId: id });
  };

  const enterSession = (moduleId, level, subMode) => {
    if (moduleId === 'words') {
      const screens = { picture: 'words-pic', fill: 'words-fill', build: 'words-build', read: 'words-pic' };
      nav({ name: screens[subMode] || 'words-pic', level, subMode });
    } else {
      nav({ name: `session-${moduleId}`, level });
    }
  };

  const finishSession = (score, total) => {
    setLastScore({ score, total });
    // 1 in 2 chance to show level-complete celebration
    if (score >= total - 1) nav({ name: 'celebrate', moduleId: route.moduleId || routeToModule(route.name), level: route.level || 5 });
    else nav({ name: 'summary', moduleId: route.moduleId || routeToModule(route.name) });
  };

  // Tweak overrides for bee expressions: if tweak set, use that everywhere
  const beeOverride = t.beeExpression === 'auto' ? null : t.beeExpression;
  React.useEffect(() => {
    window.__beeOverride = beeOverride;
    // force a re-render so all Bee instances pick up the override
    window.dispatchEvent(new Event('gabee-bee-override'));
  }, [beeOverride]);

  function renderScreen() {
    const common = { profile, lang, setLang };
    if (route.name === 'welcome') return <Welcome {...common} onDone={pickProfile} showSkeletons={t.showSkeletons} />;
    if (!profile) return <Welcome {...common} onDone={pickProfile} showSkeletons={t.showSkeletons} />;
    if (route.name === 'home') return <Home {...common} progress={progress} onModule={enterModule} onSettings={goSettings} showSkeletons={t.showSkeletons} />;
    if (route.name === 'levelmap') return <LevelMap {...common} moduleId={route.moduleId} progress={progress} onLevel={(n) => enterSession(route.moduleId, n)} onHome={goHome} onBack={goHome} />;
    if (route.name === 'words-sub') return <WordsSubmodePick {...common} onSub={(s) => enterSession('words', 1, s)} onBack={goHome} onHome={goHome} />;
    if (route.name === 'session-numbers') return <NumbersSession {...common} onBack={() => nav({ name: 'levelmap', moduleId: 'numbers' })} onHome={goHome} onDone={finishSession} />;
    if (route.name === 'words-pic')  return <WordsPictureSession {...common} onBack={() => nav({ name: 'words-sub' })} onHome={goHome} onDone={finishSession} />;
    if (route.name === 'words-fill') return <WordsFillSession {...common} onBack={() => nav({ name: 'words-sub' })} onHome={goHome} onDone={finishSession} />;
    if (route.name === 'words-build')return <WordsBuildSession {...common} onBack={() => nav({ name: 'words-sub' })} onHome={goHome} onDone={finishSession} />;
    if (route.name === 'session-keyboard') return <KeyboardSession {...common} audio={audio} onBack={() => nav({ name: 'levelmap', moduleId: 'keyboard' })} onHome={goHome} onDone={finishSession} />;
    if (route.name === 'session-code') return <CodeSession {...common} onBack={() => nav({ name: 'levelmap', moduleId: 'code' })} onHome={goHome} onDone={finishSession} />;
    if (route.name === 'session-translation') return <TranslationSession {...common} audio={audio} onBack={() => nav({ name: 'levelmap', moduleId: 'translation' })} onHome={goHome} onDone={finishSession} />;
    if (route.name === 'summary')   return <SessionSummary {...common} moduleId={route.moduleId || 'numbers'} score={lastScore.score} total={lastScore.total} progress={progress} onAgain={goHome} onHome={goHome} />;
    if (route.name === 'celebrate') return <Celebration {...common} moduleId={route.moduleId || 'numbers'} level={route.level || 5} onContinue={() => nav({ name: 'levelmap', moduleId: route.moduleId || 'numbers' })} />;
    if (route.name === 'settings')  return <Settings {...common} audio={audio} setAudio={setAudio} onBack={() => nav({ name: 'home' })} onSwitchProfile={() => { setProfile(null); nav({ name: 'welcome' }); }} />;
    if (route.name === 'daycap')    return <DailyCap {...common} progress={progress} onBack={goHome} />;
    return null;
  }

  // Apply variation/density/type classes to outer wrapper
  const stageClass = [
    'app-stage',
    'variation-experimental',
    seededRoute ? 'app-embedded' : ''
  ].join(' ').trim();

  // Quick-jump scenes for demo
  const sceneJumps = [
    { id: 'welcome', label: 'Welcome / onboarding', go: () => { setProfile(null); nav({ name: 'welcome' }); } },
    { id: 'home', label: 'Home / hub', go: () => { if (!profile) setProfile(PROFILES[0]); nav({ name: 'home' }); } },
    { id: 'levelmap', label: 'Level map (Numbers)', go: () => { if (!profile) setProfile(PROFILES[0]); nav({ name: 'levelmap', moduleId: 'numbers' }); } },
    { id: 'levelmap-code', label: 'Level map (Code)', go: () => { if (!profile) setProfile(PROFILES[0]); nav({ name: 'levelmap', moduleId: 'code' }); } },
    { id: 'words-sub', label: 'Words sub-modes', go: () => { if (!profile) setProfile(PROFILES[0]); nav({ name: 'words-sub' }); } },
    { id: 'session-numbers', label: 'Session: Numbers', go: () => { if (!profile) setProfile(PROFILES[0]); nav({ name: 'session-numbers', level: 5 }); } },
    { id: 'words-pic', label: 'Session: Words / pic→word', go: () => { if (!profile) setProfile(PROFILES[0]); nav({ name: 'words-pic' }); } },
    { id: 'words-fill', label: 'Session: Words / fill blank', go: () => { if (!profile) setProfile(PROFILES[0]); nav({ name: 'words-fill' }); } },
    { id: 'words-build', label: 'Session: Words / build sentence', go: () => { if (!profile) setProfile(PROFILES[0]); nav({ name: 'words-build' }); } },
    { id: 'session-keyboard', label: 'Session: Keyboard', go: () => { if (!profile) setProfile(PROFILES[0]); nav({ name: 'session-keyboard' }); } },
    { id: 'session-code', label: 'Session: Code', go: () => { if (!profile) setProfile(PROFILES[0]); nav({ name: 'session-code' }); } },
    { id: 'session-translation', label: 'Session: Translation', go: () => { if (!profile) setProfile(PROFILES[0]); nav({ name: 'session-translation' }); } },
    { id: 'summary', label: 'Session summary', go: () => { if (!profile) setProfile(PROFILES[0]); setLastScore({ score: 6, total: 7 }); nav({ name: 'summary', moduleId: 'numbers' }); } },
    { id: 'celebrate', label: 'Level complete', go: () => { if (!profile) setProfile(PROFILES[0]); nav({ name: 'celebrate', moduleId: 'numbers', level: 5 }); } },
    { id: 'daycap', label: 'Daily cap', go: () => { if (!profile) setProfile(PROFILES[0]); nav({ name: 'daycap' }); } },
    { id: 'settings', label: 'Kid settings', go: () => { if (!profile) setProfile(PROFILES[0]); nav({ name: 'settings' }); } }
  ];

  const isEmbedded = seededRoute !== null;

  return (
    <div className={stageClass}>
      <div className="kid-frame">
        {renderScreen()}
      </div>

      {!isEmbedded && <TweaksPanel>
        <TweakSection label="Bee mood" />
        <TweakSelect label="Expression" value={t.beeExpression}
          options={['auto', 'idle', 'focus', 'correct', 'encourage', 'celebrate']}
          onChange={(v) => setTweak('beeExpression', v)} />

        <TweakSection label="States" />
        <TweakToggle label="Show skeletons" value={t.showSkeletons}
          onChange={(v) => setTweak('showSkeletons', v)} />

        <TweakSection label="Jump to scene" />
        <div style={{ display:'flex', flexDirection:'column', gap: 6 }}>
          {sceneJumps.map(s => (
            <button key={s.id} onClick={s.go} style={{
              textAlign:'left', padding:'8px 10px', borderRadius:8, border:'1px solid #ddd',
              background: route.name.includes(s.id) || s.id === route.name ? '#FFB400' : 'white',
              fontFamily:'inherit', cursor:'pointer', fontSize: 12, fontWeight: 600
            }}>{s.label}</button>
          ))}
        </div>
      </TweaksPanel>}
    </div>
  );
}

function routeToModule(name) {
  if (name === 'session-numbers') return 'numbers';
  if (name === 'session-keyboard') return 'keyboard';
  if (name === 'session-code') return 'code';
  if (name === 'session-translation') return 'translation';
  if (name.startsWith('words')) return 'words';
  return 'numbers';
}

ReactDOM.createRoot(document.getElementById('root')).render(<GabeeApp />);
