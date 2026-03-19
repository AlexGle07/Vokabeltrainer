import { useState, useEffect } from "react";

// ── SheetJS ──────────────────────────────────────────────────────────────────
function useXLSX() {
  const [ready, setReady] = useState(!!window.XLSX);
  useEffect(() => {
    if (window.XLSX) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

// ── OneDrive ─────────────────────────────────────────────────────────────────
const ONEDRIVE_SHARE_URL =
  "https://1drv.ms/x/c/b8350577302a027d/IQAlqHiVXzF9TKTIxNUd5Vn7AXN4_po6AyrutZIOaTNuNXk?e=msKhGIC";

function shareUrlToDownload(shareUrl) {
  const encoded = btoa(shareUrl)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `https://api.onedrive.com/v1.0/shares/u!${encoded}/root/content`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

function isCorrect(given, correct) {
  const norm = s => String(s ?? "").toLowerCase().trim();
  const g = norm(given);
  return String(correct ?? "").split(/[,;/]/).map(norm).some(c => c === g || c.includes(g) || g.includes(c));
}

const scoreKey = (deckName, mode) => `${deckName}||${mode}`;

function buildOptions(card, direction) {
  const correct   = direction === "en-de" ? card.de : card.en;
  const wrongPool = direction === "en-de" ? card.wrongDe : card.wrongEn;
  const wrongs    = shuffle(wrongPool).slice(0, 3);
  return shuffle([correct, ...wrongs]);
}

function parseWorkbook(wb) {
  const result = {};
  wb.SheetNames.forEach(name => {
    const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1, defval: "", blankrows: false,
    });
    const headerRow = rows[0] || [];
    const col = {};
    headerRow.forEach((h, i) => {
      const key = String(h ?? "").trim().toLowerCase();
      if      (key === "english")      col.en   = i;
      else if (key === "german")       col.de   = i;
      else if (key === "mc_english_1") col.wEn0 = i;
      else if (key === "mc_english_2") col.wEn1 = i;
      else if (key === "mc_english_3") col.wEn2 = i;
      else if (key === "mc_german_1")  col.wDe0 = i;
      else if (key === "mc_german_2")  col.wDe1 = i;
      else if (key === "mc_german_3")  col.wDe2 = i;
    });
    if (col.en === undefined || col.de === undefined) return;

    const dataRows = rows.slice(1).filter(r => r.some(c => String(c).trim().length > 0));
    const words = dataRows
      .map(r => ({
        en:      String(r[col.en]  ?? "").trim(),
        de:      String(r[col.de]  ?? "").trim(),
        wrongEn: [col.wEn0, col.wEn1, col.wEn2]
                   .filter(i => i !== undefined)
                   .map(i => String(r[i] ?? "").trim())
                   .filter(Boolean),
        wrongDe: [col.wDe0, col.wDe1, col.wDe2]
                   .filter(i => i !== undefined)
                   .map(i => String(r[i] ?? "").trim())
                   .filter(Boolean),
      }))
      .filter(w => w.en.length > 0 && w.de.length > 0);

    if (words.length > 50) {
      const mid = Math.ceil(words.length / 2);
      result[`${name} (Teil 1)`] = words.slice(0, mid);
      result[`${name} (Teil 2)`] = words.slice(mid);
    } else if (words.length > 0) {
      result[name] = words;
    }
  });
  return result;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const xlsxReady = useXLSX();
  const [decks, setDecks]               = useState(null);
  const [quiz, setQuiz]                 = useState(null);
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [selectedMode, setSelectedMode] = useState(null);
  const [dragOver, setDO]               = useState(false);
  const [bestScores, setBestScores]     = useState({});
  const [autoLoading, setAutoLoading]   = useState(true);
  const [autoError, setAutoError]       = useState(null);

  // Auto-load from OneDrive once SheetJS is ready
  useEffect(() => {
    if (!xlsxReady) return;
    const downloadUrl = shareUrlToDownload(ONEDRIVE_SHARE_URL);
    fetch(downloadUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(buf => {
        const wb = window.XLSX.read(buf, { type: "array" });
        const result = parseWorkbook(wb);
        if (!Object.keys(result).length) throw new Error("Keine Vokabeln gefunden");
        setDecks(result);
        setAutoLoading(false);
      })
      .catch(err => {
        setAutoError(err.message);
        setAutoLoading(false);
      });
  }, [xlsxReady]);

  const saveBest = (deckName, mode, pct) =>
    setBestScores(prev => {
      const k = scoreKey(deckName, mode);
      return { ...prev, [k]: Math.max(pct, prev[k] ?? 0) };
    });

  const loadFile = (file) => {
    if (!window.XLSX) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = window.XLSX.read(e.target.result, { type: "array" });
        const result = parseWorkbook(wb);
        if (!Object.keys(result).length) {
          alert("Keine Vokabeln gefunden. Bitte pruefe die Spaltenstruktur.");
          return;
        }
        setDecks(result);
        setQuiz(null);
      } catch (err) { alert("Fehler: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (autoLoading) return (
    <div style={S.root}>
      <style>{BASE_CSS}</style>
      <div style={S.center}>
        <div style={{ ...S.uploadCard, border: "2px solid #e0d5c5" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>☁️</div>
          <h1 style={{ fontSize: 20, fontWeight: "bold", color: "#2c1f14", marginBottom: 8 }}>Vokabeltrainer</h1>
          <p style={{ color: "#9a8878", fontSize: 14 }}>Lade Vokabeln …</p>
          <div style={S.spinner} />
        </div>
      </div>
    </div>
  );

  // ── Upload screen (fallback if OneDrive failed) ─────────────────────────────
  if (!decks) return (
    <div style={S.root}>
      <style>{BASE_CSS}</style>
      <div style={S.center}>
        <div
          style={{ ...S.uploadCard, ...(dragOver ? S.dragOver : {}) }}
          onDragOver={e => { e.preventDefault(); setDO(true); }}
          onDragLeave={() => setDO(false)}
          onDrop={e => { e.preventDefault(); setDO(false); loadFile(e.dataTransfer.files[0]); }}
        >
          <div style={{ fontSize: 52, marginBottom: 12 }}>📊</div>
          <h1 style={{ fontSize: 22, fontWeight: "bold", color: "#2c1f14", marginBottom: 8 }}>Vokabeltrainer</h1>
          {autoError && (
            <div style={{ background: "#fce8e8", border: "1px solid #ef9a9a", borderRadius: 10,
              padding: "10px 14px", fontSize: 13, color: "#c62828", marginBottom: 16 }}>
              Automatisches Laden fehlgeschlagen ({autoError})<br />
              <span style={{ color: "#7a6555" }}>Bitte Datei manuell hochladen.</span>
            </div>
          )}
          <p style={{ color: "#7a6555", fontSize: 14, marginBottom: 24, lineHeight: 1.7 }}>
            Excel-Datei hochladen<br />
            <span style={{ fontSize: 12, color: "#9a8878" }}>
              Header: <strong>English</strong> · <strong>German</strong><br />
              <strong>MC_English_1-3</strong> · <strong>MC_German_1-3</strong><br />
              Spalte "Anmerkungen" wird automatisch ignoriert
            </span>
          </p>
          {!xlsxReady
            ? <div style={{ color: "#9a8878", fontSize: 13 }}>Lade Bibliothek ...</div>
            : <label style={S.uploadBtn}>
                Datei auswaehlen
                <input type="file" accept=".xlsx,.xls" style={{ display: "none" }}
                  onChange={e => e.target.files[0] && loadFile(e.target.files[0])} />
              </label>
          }
          <p style={{ color: "#ccc", fontSize: 12, marginTop: 14 }}>oder Datei hierher ziehen</p>
        </div>
      </div>
    </div>
  );

  // ── Active quiz ─────────────────────────────────────────────────────────────
  if (quiz) {
    const onComplete = (deckName, pct) => saveBest(deckName, quiz.mode, pct);
    return quiz.mode === "mc"
      ? <MCScreen   quiz={quiz} onChange={setQuiz} onBack={() => setQuiz(null)} onComplete={onComplete} />
      : <QuizScreen quiz={quiz} onChange={setQuiz} onBack={() => setQuiz(null)} onComplete={onComplete} />;
  }

  // ── Mode + direction picker ─────────────────────────────────────────────────
  if (selectedDeck) {
    const words  = decks[selectedDeck];
    const goBack = () => { setSelectedDeck(null); setSelectedMode(null); };

    const startQuiz = (mode, dirMode) => {
      const dir = dirMode === "random" ? (Math.random() < .5 ? "en-de" : "de-en") : dirMode;
      const queue = shuffle(words);
      setQuiz({
        mode, deckName: selectedDeck, queue,
        idx: 0, answer: "", feedback: null, chosenOption: null,
        score: { r: 0, w: 0 }, wrongCards: [],
        dirMode, dir,
        options: mode === "mc" ? buildOptions(queue[0], dir) : null,
      });
      setSelectedDeck(null);
      setSelectedMode(null);
    };

    if (!selectedMode) return (
      <div style={S.root}>
        <style>{BASE_CSS}</style>
        <header style={S.header}>
          <button style={S.btnSm} onClick={goBack}>← Decks</button>
          <span style={{ color: "#7a6555", fontSize: 14, fontWeight: "bold" }}>{selectedDeck}</span>
          <span />
        </header>
        <main style={S.main}>
          <div style={S.card}>
            <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 4 }}>Lernmodus</h2>
            <p style={{ color: "#9a8878", fontSize: 13, marginBottom: 24 }}>
              {words.length} Vokabeln · Wie moechtest du lernen?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { mode: "freitext", icon: "✍️", label: "Freitext",        desc: "Tippe die Uebersetzung selbst ein" },
                { mode: "mc",       icon: "🔲", label: "Multiple Choice", desc: "Waehle aus 4 Antwortmoeglichkeiten" },
              ].map(({ mode, icon, label, desc }) => (
                <button key={mode} onClick={() => setSelectedMode(mode)} style={S.pickerBtn}
                  onMouseEnter={e => { e.currentTarget.style.background = "#f5f0e8"; e.currentTarget.style.borderColor = "#7c5c3a"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#fffdf8"; e.currentTarget.style.borderColor = "#e0d5c5"; }}>
                  <span style={{ fontSize: 28 }}>{icon}</span>
                  <div>
                    <div style={{ fontWeight: "bold", fontSize: 15, color: "#2c1f14" }}>{label}</div>
                    <div style={{ fontSize: 12, color: "#9a8878", marginTop: 2 }}>{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </main>
      </div>
    );

    return (
      <div style={S.root}>
        <style>{BASE_CSS}</style>
        <header style={S.header}>
          <button style={S.btnSm} onClick={() => setSelectedMode(null)}>← Modus</button>
          <span style={{ color: "#7a6555", fontSize: 14, fontWeight: "bold" }}>
            {selectedDeck} · {selectedMode === "mc" ? "Multiple Choice" : "Freitext"}
          </span>
          <span />
        </header>
        <main style={S.main}>
          <div style={S.card}>
            <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 4 }}>Abfragerichtung</h2>
            <p style={{ color: "#9a8878", fontSize: 13, marginBottom: 24 }}>
              {words.length} Vokabeln · Wie soll abgefragt werden?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { dir: "en-de",  flag: "🇬🇧 → 🇩🇪", label: "Englisch → Deutsch", desc: "Du siehst das englische Wort" },
                { dir: "de-en",  flag: "🇩🇪 → 🇬🇧", label: "Deutsch → Englisch", desc: "Du siehst das deutsche Wort" },
                { dir: "random", flag: "🔀",          label: "Zufaellig",          desc: "Richtung wechselt jede Karte" },
              ].map(({ dir, flag, label, desc }) => (
                <button key={dir} onClick={() => startQuiz(selectedMode, dir)} style={S.pickerBtn}
                  onMouseEnter={e => { e.currentTarget.style.background = "#f5f0e8"; e.currentTarget.style.borderColor = "#7c5c3a"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#fffdf8"; e.currentTarget.style.borderColor = "#e0d5c5"; }}>
                  <span style={{ fontSize: 26 }}>{flag}</span>
                  <div>
                    <div style={{ fontWeight: "bold", fontSize: 15, color: "#2c1f14" }}>{label}</div>
                    <div style={{ fontSize: 12, color: "#9a8878", marginTop: 2 }}>{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Deck list ───────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <style>{BASE_CSS}</style>
      <header style={S.header}>
        <span style={S.logo}>📖 Vokabeltrainer</span>
        <button style={S.btnSm} onClick={() => { setDecks(null); setAutoError("Manueller Upload"); }}>
          Andere Datei ↑
        </button>
      </header>
      <main style={S.main}>
        <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 4 }}>Deine Decks</h2>
        <p style={{ color: "#9a8878", fontSize: 13, marginBottom: 20 }}>Waehle ein Tabellenblatt</p>
        <div style={S.grid}>
          {Object.entries(decks).map(([name, words]) => {
            const ftScore = bestScores[scoreKey(name, "freitext")];
            const mcScore = bestScores[scoreKey(name, "mc")];
            return (
              <div key={name} style={S.deckCard} onClick={() => setSelectedDeck(name)}>
                <div style={{ fontSize: 34, marginBottom: 8 }}>🗂</div>
                <div style={{ fontWeight: "bold", fontSize: 15, marginBottom: 4, wordBreak: "break-word" }}>{name}</div>
                <div style={{ color: "#9a8878", fontSize: 13, marginBottom: 10 }}>{words.length} Vokabeln</div>
                <div style={{ fontSize: 12, marginBottom: 10, display: "flex", flexDirection: "column", gap: 3, textAlign: "left" }}>
                  <ScoreBadge label="✍️ Freitext" pct={ftScore} />
                  <ScoreBadge label="🔲 MC" pct={mcScore} />
                </div>
                <div style={{ color: "#7c5c3a", fontSize: 13, fontWeight: "bold" }}>Quiz starten →</div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

// ── Score Badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ label, pct }) {
  if (pct === undefined) return <span style={{ color: "#ccc" }}>{label}: —</span>;
  const color = pct >= 80 ? "#388e3c" : pct >= 50 ? "#7c5c3a" : "#d32f2f";
  return <span style={{ color, fontWeight: "bold" }}>{label}: {pct} %</span>;
}

// ── Results Screen ────────────────────────────────────────────────────────────
function ResultsScreen({ score, queue, deckName, wrongCards, isAborted, isRetry, onBack, onRetry, onWrongRetry }) {
  const total = score.r + score.w;
  const pct   = total ? Math.round(score.r / total * 100) : 0;
  return (
    <div style={S.root}>
      <style>{BASE_CSS}</style>
      <header style={S.header}>
        <button style={S.btnSm} onClick={onBack}>← Decks</button>
        <span style={{ color: "#7a6555", fontSize: 14 }}>{deckName}</span>
        <span />
      </header>
      <main style={S.main}>
        <div style={{ ...S.card, textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>{pct >= 80 ? "🎉" : pct >= 50 ? "💪" : "📚"}</div>
          <h2 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>{isAborted ? "Abgebrochen" : "Fertig!"}</h2>
          <p style={{ color: "#9a8878", marginBottom: 28 }}>
            {deckName}
            {isAborted && <span style={{ display: "block", fontSize: 12, marginTop: 4 }}>{total} von {queue.length} Karten beantwortet</span>}
            {isRetry   && <span style={{ display: "block", fontSize: 12, marginTop: 4, color: "#c62828" }}>Fehler-Wiederholung (wird nicht gewertet)</span>}
          </p>
          <div style={{ display: "flex", gap: 32, justifyContent: "center", marginBottom: 28 }}>
            {[["Richtig", score.r, "#388e3c"], ["Falsch", score.w, "#d32f2f"], ["Quote", pct + "%", "#7c5c3a"]].map(([l, v, c]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 36, fontWeight: "bold", color: c }}>{v}</div>
                <div style={{ fontSize: 12, color: "#9a8878" }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button style={S.btn} onClick={onRetry}>Nochmal</button>
            {wrongCards && wrongCards.length > 0 && (
              <button style={{ ...S.btn, background: "#fce8e8", color: "#c62828", border: "1px solid #ef9a9a" }}
                onClick={onWrongRetry}>
                Fehler wiederholen ({wrongCards.length})
              </button>
            )}
            <button style={{ ...S.btn, background: "#fff", color: "#7c5c3a", border: "1px solid #e0d5c5" }} onClick={onBack}>
              Andere Decks
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Freitext Quiz ─────────────────────────────────────────────────────────────
function QuizScreen({ quiz, onChange, onBack, onComplete }) {
  const { queue, idx, answer, feedback, score, dir, deckName, wrongCards, isRetry } = quiz;
  const set    = p => onChange(q => ({ ...q, ...p }));
  const newDir = (dm) => dm === "random" ? (Math.random() < .5 ? "en-de" : "de-en") : dm;

  const current    = queue[idx];
  const isFinished = idx >= queue.length;
  const isAborted  = isFinished && (score.r + score.w) < queue.length;

  const check = () => {
    if (!answer.trim() || feedback) return;
    const correct = dir === "en-de" ? current.de : current.en;
    const ok = isCorrect(answer, correct);
    set({
      feedback: ok ? "right" : "wrong",
      score: { r: score.r + (ok ? 1 : 0), w: score.w + (ok ? 0 : 1) },
      wrongCards: ok ? quiz.wrongCards : [...quiz.wrongCards, current],
    });
  };

  const next = () => {
    const nextDir    = newDir(quiz.dirMode);
    const isLastCard = idx + 1 >= queue.length;
    if (isLastCard && !isRetry) {
      const ft = score.r + score.w;
      onComplete(deckName, ft ? Math.round(score.r / ft * 100) : 0);
    }
    set({ idx: idx + 1, feedback: null, answer: "", dir: nextDir });
  };

  if (isFinished) return (
    <ResultsScreen
      score={score} queue={queue} deckName={deckName} wrongCards={wrongCards}
      isAborted={isAborted} isRetry={isRetry} onBack={onBack}
      onRetry={() => onChange(q => ({ ...q, queue: shuffle(queue), idx: 0, answer: "", feedback: null, score: { r: 0, w: 0 }, wrongCards: [], isRetry: false, dir: newDir(q.dirMode) }))}
      onWrongRetry={() => onChange(q => ({ ...q, queue: shuffle(wrongCards), idx: 0, answer: "", feedback: null, score: { r: 0, w: 0 }, wrongCards: [], isRetry: true, dir: newDir(q.dirMode) }))}
    />
  );

  const question      = dir === "en-de" ? current.en : current.de;
  const correctAnswer = dir === "en-de" ? current.de : current.en;
  const progress      = (idx / queue.length) * 100;

  return (
    <div style={S.root}>
      <style>{BASE_CSS}</style>
      <header style={S.header}>
        <span style={{ color: "#7a6555", fontSize: 14, fontWeight: "bold" }}>{deckName}</span>
        <span style={{ color: "#9a8878", fontSize: 13 }}>{score.r}✓ {score.w}✗</span>
        <button style={{ ...S.btnSm, color: "#c62828", borderColor: "#f5c0c0" }}
          onClick={() => set({ idx: queue.length })}>Abbrechen</button>
      </header>
      <div style={{ height: 4, background: "#e0d5c5" }}>
        <div style={{ height: "100%", width: progress + "%", background: "#7c5c3a", transition: "width .3s" }} />
      </div>
      <main style={S.main}>
        <div style={{ ...S.card, animation: "fadeIn .18s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#9a8878", marginBottom: 20 }}>
            <span>{idx + 1} / {queue.length}</span>
            <span>{dir === "en-de" ? "🇬🇧 → 🇩🇪" : "🇩🇪 → 🇬🇧"}</span>
          </div>
          <div style={{ fontSize: 36, fontWeight: "bold", textAlign: "center", margin: "8px 0", wordBreak: "break-word" }}>
            {question}
          </div>
          <p style={{ textAlign: "center", fontSize: 13, color: "#9a8878", marginBottom: 24 }}>
            {dir === "en-de" ? "Wie lautet die deutsche Uebersetzung?" : "What's the English translation?"}
          </p>
          {!feedback && (
            <div style={{ display: "flex", gap: 8 }}>
              <input key={idx} style={S.input} value={answer} autoFocus
                onChange={e => set({ answer: e.target.value })}
                onKeyDown={e => e.key === "Enter" && check()}
                placeholder="Deine Antwort ..." />
              <button style={S.btn} onClick={check} disabled={!answer.trim()}>Pruefen</button>
            </div>
          )}
          {feedback === "right" && (
            <div style={{ ...S.fb, background: "#e8f5e9", borderColor: "#a5d6a7", color: "#2e7d32" }}>
              Richtig! <strong>{correctAnswer}</strong>
            </div>
          )}
          {feedback === "wrong" && (
            <div style={{ ...S.fb, background: "#fce8e8", borderColor: "#ef9a9a", color: "#c62828" }}>
              Falsch — richtig waere: <strong>{correctAnswer}</strong>
            </div>
          )}
          {feedback && (
            <button style={{ ...S.btn, width: "100%", marginTop: 14 }} onClick={next}>
              {idx + 1 >= queue.length ? "Ergebnis anzeigen" : "Weiter →"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Multiple Choice Quiz ──────────────────────────────────────────────────────
function MCScreen({ quiz, onChange, onBack, onComplete }) {
  const { queue, idx, feedback, score, dir, deckName, wrongCards, isRetry, chosenOption } = quiz;
  const set    = p => onChange(q => ({ ...q, ...p }));
  const newDir = (dm) => dm === "random" ? (Math.random() < .5 ? "en-de" : "de-en") : dm;

  const current    = queue[idx];
  const isFinished = idx >= queue.length;
  const isAborted  = isFinished && (score.r + score.w) < queue.length;

  if (isFinished) return (
    <ResultsScreen
      score={score} queue={queue} deckName={deckName} wrongCards={wrongCards}
      isAborted={isAborted} isRetry={isRetry} onBack={onBack}
      onRetry={() => {
        const q0 = shuffle(queue); const d = newDir(quiz.dirMode);
        onChange(q => ({ ...q, queue: q0, idx: 0, feedback: null, chosenOption: null, answer: "", score: { r: 0, w: 0 }, wrongCards: [], isRetry: false, dir: d, options: buildOptions(q0[0], d) }));
      }}
      onWrongRetry={() => {
        const q0 = shuffle(wrongCards); const d = newDir(quiz.dirMode);
        onChange(q => ({ ...q, queue: q0, idx: 0, feedback: null, chosenOption: null, answer: "", score: { r: 0, w: 0 }, wrongCards: [], isRetry: true, dir: d, options: buildOptions(q0[0], d) }));
      }}
    />
  );

  const currentOptions = quiz.options || buildOptions(current, dir);
  const correctAnswer  = dir === "en-de" ? current.de : current.en;
  const question       = dir === "en-de" ? current.en : current.de;
  const progress       = (idx / queue.length) * 100;

  const choose = (option) => {
    if (feedback) return;
    const ok = option === correctAnswer;
    set({
      feedback: ok ? "right" : "wrong",
      chosenOption: option,
      score: { r: score.r + (ok ? 1 : 0), w: score.w + (ok ? 0 : 1) },
      wrongCards: ok ? quiz.wrongCards : [...quiz.wrongCards, current],
    });
  };

  const next = () => {
    const nextDir     = newDir(quiz.dirMode);
    const isLastCard  = idx + 1 >= queue.length;
    if (isLastCard && !isRetry) {
      const ft = score.r + score.w;
      onComplete(deckName, ft ? Math.round(score.r / ft * 100) : 0);
    }
    const nextCard    = queue[idx + 1];
    const nextOptions = nextCard ? buildOptions(nextCard, nextDir) : null;
    set({ idx: idx + 1, feedback: null, chosenOption: null, answer: "", dir: nextDir, options: nextOptions });
  };

  return (
    <div style={S.root}>
      <style>{BASE_CSS}</style>
      <header style={S.header}>
        <span style={{ color: "#7a6555", fontSize: 14, fontWeight: "bold" }}>{deckName}</span>
        <span style={{ color: "#9a8878", fontSize: 13 }}>{score.r}✓ {score.w}✗</span>
        <button style={{ ...S.btnSm, color: "#c62828", borderColor: "#f5c0c0" }}
          onClick={() => set({ idx: queue.length })}>Abbrechen</button>
      </header>
      <div style={{ height: 4, background: "#e0d5c5" }}>
        <div style={{ height: "100%", width: progress + "%", background: "#7c5c3a", transition: "width .3s" }} />
      </div>
      <main style={S.main}>
        <div style={{ ...S.card, animation: "fadeIn .18s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#9a8878", marginBottom: 20 }}>
            <span>{idx + 1} / {queue.length}</span>
            <span>{dir === "en-de" ? "🇬🇧 → 🇩🇪" : "🇩🇪 → 🇬🇧"}</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: "bold", textAlign: "center", margin: "8px 0 6px", wordBreak: "break-word" }}>
            {question}
          </div>
          <p style={{ textAlign: "center", fontSize: 13, color: "#9a8878", marginBottom: 22 }}>
            {dir === "en-de" ? "Waehle die deutsche Uebersetzung:" : "Choose the English translation:"}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {currentOptions.map((opt, i) => {
              const isChosen     = chosenOption === opt;
              const isCorrectOpt = opt === correctAnswer;
              let bg = "#f5f0e8", border = "#e0d5c5", color = "#2c1f14", fw = "normal";
              if (feedback) {
                if (isCorrectOpt)  { bg = "#e8f5e9"; border = "#a5d6a7"; color = "#2e7d32"; fw = "bold"; }
                else if (isChosen) { bg = "#fce8e8"; border = "#ef9a9a"; color = "#c62828"; }
              }
              return (
                <button key={i} onClick={() => choose(opt)} disabled={!!feedback}
                  style={{ padding: "12px 16px", borderRadius: 10, border: `1px solid ${border}`,
                    background: bg, color, fontSize: 15, fontFamily: "inherit", textAlign: "left",
                    cursor: feedback ? "default" : "pointer", fontWeight: fw }}>
                  {feedback && isCorrectOpt ? "✓ " : feedback && isChosen ? "✗ " : ""}{opt}
                </button>
              );
            })}
          </div>
          {feedback && (
            <button style={{ ...S.btn, width: "100%", marginTop: 16 }} onClick={next}>
              {idx + 1 >= queue.length ? "Ergebnis anzeigen" : "Weiter →"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const BASE_CSS = `
@keyframes fadeIn { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:none; } }
@keyframes spin { to { transform: rotate(360deg); } }
* { box-sizing:border-box; margin:0; padding:0; }
button { font-family:inherit; cursor:pointer; transition:background .12s, border-color .12s; }
button:hover:not(:disabled) { opacity:.85; }
button:disabled { cursor:default; }
input:focus { border-color:#7c5c3a !important; outline:none; box-shadow:0 0 0 3px rgba(124,92,58,.12); }
`;

const S = {
  root:       { minHeight: "100vh", background: "#f5f0e8", fontFamily: "Georgia,serif", color: "#2c1f14" },
  center:     { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 20 },
  header:     { background: "#fffdf8", borderBottom: "1px solid #e0d5c5", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo:       { fontSize: 18, fontWeight: "bold", color: "#7c5c3a" },
  main:       { maxWidth: 520, margin: "0 auto", padding: "24px 16px" },
  card:       { background: "#fffdf8", border: "1px solid #e0d5c5", borderRadius: 16, padding: "24px 20px", boxShadow: "0 2px 16px rgba(0,0,0,.06)" },
  input:      { flex: 1, padding: "10px 13px", borderRadius: 10, border: "1px solid #e0d5c5", background: "#f5f0e8", fontSize: 15, fontFamily: "inherit", color: "#2c1f14", width: "100%" },
  btn:        { display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 20px", borderRadius: 10, border: "none", background: "#7c5c3a", color: "#fff", fontSize: 15, fontFamily: "inherit", fontWeight: "bold", whiteSpace: "nowrap" },
  btnSm:      { padding: "6px 12px", borderRadius: 8, border: "1px solid #e0d5c5", background: "transparent", color: "#7a6555", fontSize: 13 },
  fb:         { display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderRadius: 10, fontSize: 15, marginTop: 12, border: "1px solid", fontFamily: "system-ui" },
  uploadCard: { background: "#fffdf8", border: "2px dashed #e0d5c5", borderRadius: 20, padding: "48px 36px", textAlign: "center", maxWidth: 420, width: "100%", boxShadow: "0 2px 20px rgba(0,0,0,.05)", transition: "border-color .2s, background .2s" },
  dragOver:   { borderColor: "#7c5c3a", background: "#fdf8f2" },
  uploadBtn:  { display: "inline-block", padding: "11px 24px", borderRadius: 10, background: "#7c5c3a", color: "#fff", fontSize: 15, fontWeight: "bold", cursor: "pointer" },
  grid:       { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 },
  deckCard:   { background: "#fffdf8", border: "1px solid #e0d5c5", borderRadius: 14, padding: "20px 16px", cursor: "pointer", textAlign: "center", boxShadow: "0 1px 6px rgba(0,0,0,.04)", transition: "box-shadow .15s" },
  pickerBtn:  { display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderRadius: 12, border: "1px solid #e0d5c5", background: "#fffdf8", cursor: "pointer", fontFamily: "inherit", textAlign: "left" },
  spinner:    { width: 32, height: 32, border: "3px solid #e0d5c5", borderTop: "3px solid #7c5c3a", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "20px auto 0" },
};
