import React, { useState } from 'react';
import { Search, Sparkles, Target, TrendingUp, AlertCircle, Loader2, Check, X } from 'lucide-react';

export default function LottoChecker() {
  const [numbers, setNumbers] = useState(['', '', '', '', '', '']);
  const [gameType, setGameType] = useState('6/58');
  const [minMatch, setMinMatch] = useState(3);
  const [results, setResults] = useState(null);
  const [allDraws, setAllDraws] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  // Per game, list every historical page. Current year = "history-and-summary",
  // prior years = "history-summary-year-XXXX" (6/42) or
  // "ultra-lotto-result-history-summary-year-XXXX" (6/58).
  const GAME_URLS = {
    '6/58': [
      'https://www.lottopcso.com/6-58-lotto-result-history-and-summary/',
      'https://www.lottopcso.com/6-58-ultra-lotto-result-history-summary-year-2025/',
    ],
    '6/42': [
      'https://www.lottopcso.com/6-42-lotto-result-history-and-summary/',
      'https://www.lottopcso.com/6-42-lotto-result-history-summary-year-2025/',
    ],
  };

  const MAX_NUMBER = {
    '6/58': 58,
    '6/42': 42,
  };

  const WORKER_URL = 'https://lotto-proxy.jccapote-did.workers.dev';

  const handleNumberChange = (idx, value) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 2);
    const newNums = [...numbers];
    newNums[idx] = cleaned;
    setNumbers(newNums);
  };

  const parseResults = (html) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const rows = doc.querySelectorAll('table tr');
    const draws = [];

    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        const dateText = cells[0].textContent.trim();
        const numbersText = cells[1].textContent.trim();
        const match = numbersText.match(/(\d{1,2})[-\s](\d{1,2})[-\s](\d{1,2})[-\s](\d{1,2})[-\s](\d{1,2})[-\s](\d{1,2})/);
        if (match && dateText.length > 0) {
          const winningNums = match.slice(1, 7).map((n) => parseInt(n, 10));
          const jackpot = cells[2]?.textContent.trim() || '';
          draws.push({ date: dateText, numbers: winningNums, jackpot });
        }
      }
    });

    return draws;
  };

  const fetchResults = async () => {
    const parsedNums = numbers.map((n) => parseInt(n, 10));
    if (parsedNums.some((n) => isNaN(n))) {
      setError('Please fill in all 6 numbers.');
      return;
    }
    const max = MAX_NUMBER[gameType];
    if (parsedNums.some((n) => n < 1 || n > max)) {
      setError(`Numbers must be between 1 and ${max} for ${gameType}.`);
      return;
    }
    const unique = new Set(parsedNums);
    if (unique.size !== 6) {
      setError('Your 6 numbers must be unique.');
      return;
    }

    setError(null);
    setLoading(true);
    setResults(null);

    const urls = GAME_URLS[gameType];
    setProgress({ done: 0, total: urls.length });

    // Helper: try each proxy in order until one returns usable HTML for a URL.
    const fetchOne = async (target) => {
      const proxies = [
        {
          name: 'your-worker',
          url: `${WORKER_URL}/?url=${encodeURIComponent(target)}`,
          extract: async (res) => await res.text(),
        },
        {
          name: 'allorigins',
          url: `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
          extract: async (res) => (await res.json()).contents,
        },
        {
          name: 'corsproxy.io',
          url: `https://corsproxy.io/?${encodeURIComponent(target)}`,
          extract: async (res) => await res.text(),
        },
        {
          name: 'codetabs',
          url: `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(target)}`,
          extract: async (res) => await res.text(),
        },
      ];

      for (const proxy of proxies) {
        try {
          const response = await fetch(proxy.url, { signal: AbortSignal.timeout(20000) });
          if (!response.ok) continue;
          const html = await proxy.extract(response);
          if (html && html.length > 500) return html;
        } catch {
          // try next proxy
        }
      }
      return null;
    };

    try {
      // Kick off all year-pages in parallel, increment progress as each settles.
      const htmlResults = await Promise.all(
        urls.map(async (u) => {
          const html = await fetchOne(u);
          setProgress((p) => ({ ...p, done: p.done + 1 }));
          return { url: u, html };
        })
      );

      // Dedupe draws by date — if the same draw somehow appears on two pages,
      // the first occurrence wins.
      const seen = new Set();
      const allDrawsCombined = [];
      const pageFailures = [];

      for (const { url, html } of htmlResults) {
        if (!html) {
          pageFailures.push(url.split('/').filter(Boolean).pop());
          continue;
        }
        const draws = parseResults(html);
        for (const d of draws) {
          if (!seen.has(d.date)) {
            seen.add(d.date);
            allDrawsCombined.push(d);
          }
        }
      }

      if (allDrawsCombined.length === 0) {
        throw new Error(
          pageFailures.length === urls.length
            ? 'Could not fetch any page. Proxies may be down — wait 30 seconds and retry.'
            : 'Could not parse draws from the pages. Site structure may have changed.'
        );
      }

      const userSet = new Set(parsedNums);
      const matches = allDrawsCombined
        .map((draw) => {
          const matchingNums = draw.numbers.filter((n) => userSet.has(n));
          return { ...draw, matchingNums, matchCount: matchingNums.length };
        })
        .filter((d) => d.matchCount >= minMatch)
        .sort((a, b) => b.matchCount - a.matchCount);

      setAllDraws(allDrawsCombined);
      setResults(matches);
      setLastFetched(new Date());
    } catch (e) {
      setError(`${e.message} — try again in a moment.`);
    } finally {
      setLoading(false);
    }
  };

  const getMatchColor = (count) => {
    if (count === 6) return 'from-amber-400 to-yellow-600';
    if (count === 5) return 'from-rose-400 to-pink-600';
    if (count === 4) return 'from-violet-400 to-purple-600';
    return 'from-emerald-400 to-teal-600';
  };

  const getMatchLabel = (count) => {
    if (count === 6) return 'JACKPOT';
    if (count === 5) return '5 MATCH';
    if (count === 4) return '4 MATCH';
    return '3 MATCH';
  };

  return (
    <div
      className="min-h-screen w-full p-4 sm:p-8"
      style={{
        background: 'radial-gradient(ellipse at top, #1a1033 0%, #0a0618 50%, #000000 100%)',
        fontFamily: 'Georgia, "Times New Roman", serif',
      }}
    >
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="max-w-4xl mx-auto relative">
        <header className="text-center mb-12 pt-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 mb-6">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs tracking-[0.2em] text-amber-200/80 uppercase" style={{ fontFamily: 'system-ui' }}>
              PCSO Lotto History Scanner
            </span>
          </div>
          <h1
            className="text-5xl sm:text-7xl font-bold mb-4 leading-none"
            style={{
              background: 'linear-gradient(135deg, #fde68a 0%, #f59e0b 40%, #b45309 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: 'Georgia, serif',
              letterSpacing: '-0.02em',
            }}
          >
            Lucky <em className="italic font-normal">Number</em><br />
            Matcher
          </h1>
          <p className="text-stone-400 text-sm sm:text-base max-w-md mx-auto" style={{ fontFamily: 'system-ui' }}>
            Enter your combination and discover how often your numbers would have landed across every historical draw.
          </p>
        </header>

        <div
          className="rounded-2xl p-6 sm:p-8 mb-8 backdrop-blur-sm border"
          style={{
            background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.03) 0%, rgba(139, 92, 246, 0.03) 100%)',
            borderColor: 'rgba(251, 191, 36, 0.15)',
            boxShadow: '0 20px 60px -15px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div className="mb-6">
            <label className="block text-xs tracking-[0.2em] text-stone-500 uppercase mb-3" style={{ fontFamily: 'system-ui' }}>
              Game Type
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.keys(GAME_URLS).map((g) => (
                <button
                  key={g}
                  onClick={() => setGameType(g)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    gameType === g
                      ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30'
                      : 'bg-white/5 text-stone-400 hover:bg-white/10 border border-white/5'
                  }`}
                  style={{ fontFamily: 'system-ui' }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-xs tracking-[0.2em] text-stone-500 uppercase mb-3" style={{ fontFamily: 'system-ui' }}>
              Your 6 Numbers (1 – {MAX_NUMBER[gameType]})
            </label>
            <div className="grid grid-cols-6 gap-2 sm:gap-3">
              {numbers.map((n, idx) => (
                <input
                  key={idx}
                  type="text"
                  inputMode="numeric"
                  value={n}
                  onChange={(e) => handleNumberChange(idx, e.target.value)}
                  placeholder="—"
                  className="aspect-square rounded-xl text-center text-2xl sm:text-3xl font-bold bg-black/40 border-2 border-amber-500/20 text-amber-100 placeholder-stone-700 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                  style={{ fontFamily: 'Georgia, serif' }}
                />
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-xs tracking-[0.2em] text-stone-500 uppercase mb-3" style={{ fontFamily: 'system-ui' }}>
              Minimum Matches to Show
            </label>
            <div className="flex gap-2">
              {[3, 4, 5, 6].map((v) => (
                <button
                  key={v}
                  onClick={() => setMinMatch(v)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    minMatch === v
                      ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30'
                      : 'bg-white/5 text-stone-400 hover:bg-white/10 border border-white/5'
                  }`}
                  style={{ fontFamily: 'system-ui' }}
                >
                  {v}+
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={fetchResults}
            disabled={loading}
            className="w-full py-4 rounded-xl font-bold text-base tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              background: loading
                ? 'linear-gradient(135deg, #78350f, #451a03)'
                : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
              color: '#1a0f00',
              boxShadow: '0 10px 30px -10px rgba(251, 191, 36, 0.4)',
              fontFamily: 'system-ui',
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {progress.total > 0
                  ? `Scanning ${progress.done}/${progress.total} years...`
                  : 'Scanning draw history...'}
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Scan History
              </>
            )}
          </button>

          {error && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm" style={{ fontFamily: 'system-ui' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {results !== null && (
          <div className="space-y-4">
            <div
              className="rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 border"
              style={{
                background: 'rgba(16, 8, 32, 0.6)',
                borderColor: 'rgba(251, 191, 36, 0.1)',
              }}
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-full flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-600">
                  <Target className="w-5 h-5 text-black" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-100" style={{ fontFamily: 'Georgia, serif' }}>
                    {results.length} <span className="text-stone-500 font-normal text-base">{results.length === 1 ? 'match' : 'matches'}</span>
                  </div>
                  <div className="text-xs text-stone-500" style={{ fontFamily: 'system-ui' }}>
                    across {allDraws.length} draws · {gameType} · {minMatch}+ hits
                  </div>
                </div>
              </div>
              {lastFetched && (
                <div className="text-xs text-stone-500 flex items-center gap-1.5" style={{ fontFamily: 'system-ui' }}>
                  <TrendingUp className="w-3 h-3" />
                  Updated {lastFetched.toLocaleTimeString()}
                </div>
              )}
            </div>

            {results.length === 0 && (
              <div className="rounded-2xl p-10 text-center border border-stone-800 bg-black/30">
                <X className="w-10 h-10 mx-auto mb-3 text-stone-600" />
                <p className="text-stone-400" style={{ fontFamily: 'system-ui' }}>
                  No historical draws matched {minMatch} or more of your numbers. Try lowering the threshold or picking different numbers.
                </p>
              </div>
            )}

            {results.map((draw, idx) => {
              const userSet = new Set(numbers.map((n) => parseInt(n, 10)));
              return (
                <div
                  key={idx}
                  className="rounded-2xl p-5 sm:p-6 border relative overflow-hidden"
                  style={{
                    background: 'rgba(16, 8, 32, 0.5)',
                    borderColor: 'rgba(251, 191, 36, 0.1)',
                  }}
                >
                  <div
                    className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${getMatchColor(draw.matchCount)}`}
                  />

                  <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="text-xs tracking-[0.2em] text-stone-500 uppercase mb-1" style={{ fontFamily: 'system-ui' }}>
                        {draw.date}
                      </div>
                      <div className="text-stone-400 text-sm" style={{ fontFamily: 'system-ui' }}>
                        Jackpot · Php {draw.jackpot || '—'}
                      </div>
                    </div>
                    <div
                      className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wider bg-gradient-to-r ${getMatchColor(draw.matchCount)} text-black flex items-center gap-1.5`}
                      style={{ fontFamily: 'system-ui' }}
                    >
                      <Check className="w-3 h-3" />
                      {getMatchLabel(draw.matchCount)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {draw.numbers.map((n, i) => {
                      const matched = userSet.has(n);
                      return (
                        <div
                          key={i}
                          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-lg transition-transform hover:scale-110 ${
                            matched ? 'text-black' : 'text-stone-500'
                          }`}
                          style={{
                            background: matched
                              ? 'linear-gradient(135deg, #fde68a 0%, #f59e0b 100%)'
                              : 'rgba(255,255,255,0.04)',
                            border: matched ? '2px solid #fbbf24' : '2px solid rgba(255,255,255,0.08)',
                            boxShadow: matched ? '0 6px 20px -5px rgba(251, 191, 36, 0.5)' : 'none',
                            fontFamily: 'Georgia, serif',
                          }}
                        >
                          {String(n).padStart(2, '0')}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <footer className="text-center mt-12 pb-4">
          <p className="text-xs text-stone-600" style={{ fontFamily: 'system-ui' }}>
            Data from lottopcso.com · Unofficial. Verify with PCSO before claiming any prize.
          </p>
        </footer>
      </div>
    </div>
  );
}
