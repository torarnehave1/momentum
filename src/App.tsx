import { useEffect, useMemo, useState } from 'react';
import { AuthBar, EcosystemNav, LanguageSelector, authClient } from 'vegvisr-ui-kit';
import momentumLogo from './assets/momentum-logo.png';
import { LanguageContext } from './lib/LanguageContext';
import { getStoredLanguage, setStoredLanguage } from './lib/storage';
import { useTranslation } from './lib/useTranslation';

const AUTH_BASE = 'https://cookie.vegvisr.org';
const DASHBOARD_BASE = 'https://dashboard.vegvisr.org';
const CONFIG_BASE = 'https://momentum-config.vegvisr.org';
const YOUTUBE_WORKER_BASE = 'https://youtube.vegvisr.org';
const PLAYLIST_ID = 'PLUCNLMRSjtsVSE1HMcIfKUkLhgg1On0zz';

const DEFAULT_VIDEO_ID = 'Ravm34ovFRQ';

type AuthUser = {
  email: string;
  userId: string;
  role?: string | null;
};

function App() {
  const [language, setLanguageState] = useState(getStoredLanguage());
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking' | 'authed' | 'anonymous'>('checking');
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginStatus, setLoginStatus] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [videoId, setVideoId] = useState(DEFAULT_VIDEO_ID);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [saveError, setSaveError] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [playlistVideos, setPlaylistVideos] = useState<any[]>([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState('');

  const setLanguage = (value: typeof language) => {
    setLanguageState(value);
    setStoredLanguage(value);
  };

  const contextValue = useMemo(() => ({ language, setLanguage }), [language]);
  const t = useTranslation(language);

  const embedDomain =
    typeof window === 'undefined' ? 'momentum.vegvisr.org' : window.location.hostname;

  const normalizeVideoId = (value: string) => {
    if (!value) return '';
    const trimmed = value.trim();
    const urlMatch = trimmed.match(/[?&]v=([^&\s]+)/i);
    if (urlMatch && urlMatch[1]) {
      return urlMatch[1];
    }
    return trimmed.split(/\s+/)[0];
  };

  const persistUser = (payload: any) => {
    const stored = authClient.persistUser(payload);
    if (!stored) return;
    setAuthUser({
      email: stored.email,
      userId: stored.user_id || stored.oauth_id || stored.email,
      role: stored.role || null
    });
  };

  const fetchUserContext = async (targetEmail: string) => {
    const roleRes = await fetch(
      `${DASHBOARD_BASE}/get-role?email=${encodeURIComponent(targetEmail)}`
    );
    if (!roleRes.ok) {
      throw new Error(`User role unavailable (status: ${roleRes.status})`);
    }
    const roleData = await roleRes.json();
    if (!roleData?.role) {
      throw new Error('Unable to retrieve user role.');
    }

    const userDataRes = await fetch(
      `${DASHBOARD_BASE}/userdata?email=${encodeURIComponent(targetEmail)}`
    );
    if (!userDataRes.ok) {
      throw new Error(`Unable to fetch user data (status: ${userDataRes.status})`);
    }
    const userData = await userDataRes.json();
    return {
      email: targetEmail,
      role: roleData.role,
      user_id: userData.user_id,
      emailVerificationToken: userData.emailVerificationToken,
      oauth_id: userData.oauth_id,
      phone: userData.phone,
      phoneVerifiedAt: userData.phoneVerifiedAt,
      branding: userData.branding,
      profileimage: userData.profileimage
    };
  };

  const verifyMagicToken = async (token: string) => {
    const data = await authClient.verifyMagicLink({ token, baseUrl: AUTH_BASE });
    try {
      const userContext = await fetchUserContext(data.email);
      persistUser(userContext);
    } catch {
      persistUser({ email: data.email, role: 'user', user_id: data.email });
    }
  };

  const sendMagicLink = async () => {
    if (!loginEmail.trim()) return;
    setLoginError('');
    setLoginStatus('');
    setLoginLoading(true);
    try {
      const redirectUrl = `${window.location.origin}${window.location.pathname}`;
      await authClient.sendMagicLink({
        email: loginEmail.trim(),
        redirectUrl,
        baseUrl: AUTH_BASE
      });
      setLoginStatus('Magic link sent. Check your email.');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Failed to send magic link.');
    } finally {
      setLoginLoading(false);
    }
  };

  const clearAuth = () => {
    try {
      localStorage.removeItem('user');
      sessionStorage.removeItem('email_session_verified');
    } catch {
      // ignore storage errors
    }
    const base = 'vegvisr_token=; Path=/; Max-Age=0; SameSite=Lax; Secure';
    document.cookie = base;
    if (window.location.hostname.endsWith('vegvisr.org')) {
      document.cookie = `${base}; Domain=.vegvisr.org`;
    }
    setAuthUser(null);
    setAuthStatus('anonymous');
  };

  const readStoredUserSafe = () => {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.email) return null;
      return {
        email: parsed.email,
        userId: parsed.user_id || parsed.oauth_id || parsed.email,
        role: parsed.role || null
      } as AuthUser;
    } catch {
      return null;
    }
  };

  const loadConfig = async () => {
    setConfigLoading(true);
    setConfigError('');
    try {
      const response = await fetch(`${CONFIG_BASE}/config`, {
        credentials: 'include',
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`Config unavailable (${response.status})`);
      }
      const data = await response.json();
      if (data?.config?.videoId) {
        setVideoId(normalizeVideoId(data.config.videoId));
      }
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Failed to load config.');
    } finally {
      setConfigLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaveStatus('');
    setSaveError('');
    try {
      const response = await fetch(`${CONFIG_BASE}/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          videoId: normalizeVideoId(videoId),
          email: authUser?.email || ''
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || 'Failed to save config.');
      }
      setSaveStatus('Saved.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save config.');
    }
  };

  const loadPlaylist = async () => {
    setPlaylistLoading(true);
    setPlaylistError('');
    try {
      const response = await fetch(`${YOUTUBE_WORKER_BASE}/playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist_id: PLAYLIST_ID, max_results: 12 })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || 'Failed to load playlist.');
      }
      setPlaylistVideos(Array.isArray(data.videos) ? data.videos : []);
    } catch (err) {
      setPlaylistError(err instanceof Error ? err.message : 'Failed to load playlist.');
    } finally {
      setPlaylistLoading(false);
    }
  };

  useEffect(() => {
    const token = authClient.parseMagicToken(window.location.href);
    if (!token) return;
    setAuthStatus('checking');
    verifyMagicToken(token)
      .then(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('magic');
        window.history.replaceState({}, '', url.toString());
        setAuthStatus('authed');
      })
      .catch(() => {
        setAuthStatus('anonymous');
      });
  }, []);

  useEffect(() => {
    const stored = readStoredUserSafe();
    if (stored) {
      setAuthUser(stored);
      setAuthStatus('authed');
      return;
    }
    setAuthStatus('anonymous');
  }, []);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    loadPlaylist();
  }, []);

  return (
    <LanguageContext.Provider value={contextValue}>
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.25),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(139,92,246,0.25),_transparent_55%)]" />
        <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <img src={momentumLogo} alt={t('app.title')} className="h-12 w-auto" />
            <div className="flex items-center gap-3">
              <LanguageSelector value={language} onChange={setLanguage} />
              <AuthBar
                userEmail={authStatus === 'authed' ? authUser?.email : undefined}
                badgeLabel={t('app.badge')}
                signInLabel="Sign in"
                logoutLabel="Log out"
                onSignIn={() => setLoginOpen((prev) => !prev)}
                onLogout={clearAuth}
              />
            </div>
          </header>

          <EcosystemNav className="mt-4" />

          {authStatus === 'anonymous' && loginOpen && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm text-white/80">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                Magic Link Sign In
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder="you@email.com"
                  className="flex-1 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                />
                <button
                  type="button"
                  onClick={sendMagicLink}
                  disabled={loginLoading}
                  className="rounded-2xl bg-gradient-to-r from-sky-500 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30"
                >
                  {loginLoading ? 'Sending...' : 'Send link'}
                </button>
              </div>
              {loginStatus && <p className="mt-3 text-xs text-emerald-300">{loginStatus}</p>}
              {loginError && <p className="mt-3 text-xs text-rose-300">{loginError}</p>}
              <p className="mt-3 text-xs text-white/50">
                We will send a secure link that logs you into this app.
              </p>
            </div>
          )}

          <main className="mt-12 grid gap-6">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
              <h1 className="text-3xl font-semibold text-white">{t('app.title')}</h1>
              <p className="mt-3 text-sm text-white/70">Live access for Momentum sessions.</p>

              {configLoading && (
                <p className="mt-4 text-xs text-white/60">Loading stream configuration...</p>
              )}
              {configError && (
                <p className="mt-4 text-xs text-rose-300">{configError}</p>
              )}

              <div className="mt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-white/60">
                    Live stream
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowChat(true)}
                    className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 hover:bg-white/10"
                  >
                    Open chat
                  </button>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
                  <div className="aspect-video w-full">
                    <iframe
                      title="Momentum live stream"
                      className="h-full w-full"
                      src={`https://www.youtube.com/embed/${normalizeVideoId(videoId) || DEFAULT_VIDEO_ID}`}
                      allow="autoplay; encrypted-media"
                      allowFullScreen
                    />
                  </div>
                </div>
              </div>

              {authUser?.role === 'Superadmin' && (
                <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-sm text-white/80">
                  <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                    Stream Config
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[2fr,1fr]">
                    <input
                      type="text"
                      value={videoId}
                      onChange={(event) => setVideoId(event.target.value)}
                      placeholder="YouTube video ID"
                      className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                    />
                    <button
                      type="button"
                      onClick={saveConfig}
                      className="rounded-2xl bg-gradient-to-r from-sky-500 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30"
                    >
                      Save stream
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={loadConfig}
                      className="rounded-2xl border border-white/20 px-6 py-3 text-sm font-semibold text-white/80"
                    >
                      Refresh
                    </button>
                  </div>
                  {saveStatus && <p className="mt-3 text-xs text-emerald-300">{saveStatus}</p>}
                  {saveError && <p className="mt-3 text-xs text-rose-300">{saveError}</p>}
                  <p className="mt-3 text-xs text-white/50">
                    Enter the live stream video ID (the value after <span className="font-mono">v=</span>)
                    and save.
                  </p>
                </div>
              )}

              <div className="mt-10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-white/90">Previous Streams</h2>
                  <button
                    type="button"
                    onClick={loadPlaylist}
                    className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 hover:bg-white/10"
                  >
                    Refresh
                  </button>
                </div>
                {playlistLoading && (
                  <p className="mt-3 text-xs text-white/60">Loading playlist...</p>
                )}
                {playlistError && (
                  <p className="mt-3 text-xs text-rose-300">{playlistError}</p>
                )}
                {!playlistLoading && !playlistError && playlistVideos.length === 0 && (
                  <p className="mt-3 text-xs text-white/60">No playlist videos found.</p>
                )}
                {playlistVideos.length > 0 && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {playlistVideos.map((video) => (
                      <a
                        key={video.video_id || video.embed_url}
                        href={video.video_url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="group rounded-2xl border border-white/10 bg-slate-900/40 p-3 transition hover:border-sky-400/60"
                      >
                        <div className="overflow-hidden rounded-xl">
                          <img
                            src={video.thumbnails?.medium?.url || video.thumbnails?.default?.url}
                            alt={video.title || 'Video thumbnail'}
                            className="h-40 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                          />
                        </div>
                        <div className="mt-3 text-sm font-semibold text-white/90 line-clamp-2">
                          {video.title || 'Untitled stream'}
                        </div>
                        <div className="mt-1 text-xs text-white/50">
                          {video.channel_title || 'Vegvisr'}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>

      {showChat && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-white/10 bg-slate-950/95 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div className="text-sm font-semibold uppercase tracking-[0.3em] text-white/70">
              Live chat
            </div>
            <button
              type="button"
              onClick={() => setShowChat(false)}
              className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/70 hover:bg-white/10"
            >
              Close
            </button>
          </div>
          <div className="h-full p-4">
            <iframe
              title="Momentum live chat"
              className="h-[85vh] w-full rounded-2xl border border-white/10 bg-slate-900/40"
              src={`https://www.youtube.com/live_chat?v=${
                normalizeVideoId(videoId) || DEFAULT_VIDEO_ID
              }&embed_domain=${embedDomain}`}
            />
          </div>
        </div>
      )}
    </LanguageContext.Provider>
  );
}

export default App;
