import { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase";
import { askClaude, parseJSON, fileToImagePayload } from "./lib/api";
import * as db from "./lib/store";

/* ————— Commonplace: a reading companion —————
   Books, notes, photographed quotes, and themes woven across your shelf. */

const CLOTHS = ["#2F5D50", "#3A4E6B", "#6B3A3A", "#54452F", "#44355B", "#2E5D66"];
const clothFor = (id) => CLOTHS[Math.abs([...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0)) % CLOTHS.length];

const STATUSES = [
  { key: "reading", label: "Reading" },
  { key: "finished", label: "Finished" },
  { key: "wishlist", label: "Up next" },
];

const fmtWhen = (ts) =>
  new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const whereLabel = (e) =>
  [e.chapter ? `Ch. ${e.chapter}` : null, e.page ? `p. ${e.page}` : null].filter(Boolean).join(" · ");

const parseTags = (s) =>
  [...new Set(String(s).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];

const tagsOf = (books) => [...new Set(books.flatMap((b) => b.tags || []))].sort();

/* ————— Root ————— */

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined)
    return (
      <Frame>
        <Centered>Opening your commonplace book…</Centered>
      </Frame>
    );

  return <Frame>{session ? <Shell /> : <AuthScreen />}</Frame>;
}

function Frame({ children }) {
  return <div style={{ maxWidth: 560, margin: "0 auto", padding: "18px 16px 90px" }}>{children}</div>;
}

function Centered({ children }) {
  return <div style={{ padding: "80px 0", textAlign: "center", color: "var(--ink-soft)" }}>{children}</div>;
}

/* ————— Auth ————— */

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setError(error.message);
    else setSent(true);
    setBusy(false);
  };

  return (
    <div style={{ paddingTop: 60 }}>
      <h1 className="display" style={{ fontSize: 34, margin: "0 0 4px" }}>Commonplace</h1>
      <div className="eyebrow" style={{ marginBottom: 28 }}>reading &amp; marginalia</div>
      <div className="card" style={{ padding: 18 }}>
        {sent ? (
          <p style={{ margin: 0, lineHeight: 1.55 }}>
            Check your email — we sent a sign-in link to <strong>{email}</strong>. Open it on this device.
          </p>
        ) : (
          <>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Sign in</div>
            <input
              className="field"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={send} disabled={busy || !email.includes("@")}>
              {busy ? "Sending…" : "Email me a sign-in link"}
            </button>
            {error && <div style={{ color: "var(--rust)", fontSize: 13, marginTop: 8 }}>{error}</div>}
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 12, marginBottom: 0, lineHeight: 1.5 }}>
              No password needed. Your books and notes sync to your account across devices.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ————— Signed-in shell ————— */

function Shell() {
  const [tab, setTab] = useState("library");
  const [books, setBooks] = useState(null);
  const [openBookId, setOpenBookId] = useState(null);
  const [error, setError] = useState("");

  const refreshBooks = async () => {
    try {
      setBooks(await db.listBooks());
      setError("");
    } catch (e) {
      setError("Couldn't load your shelf: " + e.message);
    }
  };

  useEffect(() => {
    refreshBooks();
  }, []);

  const openBook = books?.find((b) => b.id === openBookId);

  if (books === null && !error) return <Centered>Fetching your shelf…</Centered>;

  return (
    <>
      {error && (
        <div style={{ background: "var(--rust)", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
          {error}{" "}
          <button className="chip" style={{ marginLeft: 8 }} onClick={refreshBooks}>Retry</button>
        </div>
      )}

      {openBook ? (
        <BookView
          book={openBook}
          onBack={() => {
            setOpenBookId(null);
            refreshBooks();
          }}
          onBookChanged={refreshBooks}
        />
      ) : (
        <>
          <Header tab={tab} setTab={setTab} />
          {tab === "library" ? (
            <Library books={books || []} onOpen={setOpenBookId} onChanged={refreshBooks} />
          ) : tab === "threads" ? (
            <Threads />
          ) : (
            <Settings />
          )}
        </>
      )}
    </>
  );
}

function Header({ tab, setTab }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h1 className="display" style={{ fontSize: 30, margin: 0 }}>Commonplace</h1>
        <span className="eyebrow">reading &amp; marginalia</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 14 }}>
        {[["library", "Library"], ["threads", "Threads"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`tab ${tab === k ? "tab-on" : ""}`}>
            {label}
          </button>
        ))}
        <button
          onClick={() => setTab("settings")}
          className={`tab ${tab === "settings" ? "tab-on" : ""}`}
          style={{ marginLeft: "auto", marginRight: 0, fontSize: 17 }}
          aria-label="Settings"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}

/* ————— Library ————— */

function Library({ books, onOpen, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [status, setStatus] = useState("reading");
  const [tags, setTags] = useState("");
  const [filterTag, setFilterTag] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const add = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError("");
    try {
      await db.addBook({ title: title.trim(), author: author.trim(), status, tags: parseTags(tags) });
      setTitle("");
      setAuthor("");
      setTags("");
      setAdding(false);
      onChanged();
    } catch (e) {
      setError("Couldn't add the book: " + e.message);
    }
    setBusy(false);
  };

  const allTags = tagsOf(books);
  const shown = filterTag ? books.filter((b) => (b.tags || []).includes(filterTag)) : books;
  const groups = STATUSES.map((s) => ({ ...s, books: shown.filter((b) => b.status === s.key) })).filter(
    (g) => g.books.length
  );

  return (
    <div>
      {adding ? (
        <div className="card" style={{ padding: 16, marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>New book</div>
          <input className="field" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <input className="field" placeholder="Author" value={author} onChange={(e) => setAuthor(e.target.value)} />
          <input className="field" placeholder="Tags — comma separated, e.g. basketball, memoir" value={tags} onChange={(e) => setTags(e.target.value)} />
          {allTags.filter((t) => !parseTags(tags).includes(t)).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 10px" }}>
              {allTags.filter((t) => !parseTags(tags).includes(t)).map((t) => (
                <button key={t} className="chip" onClick={() => setTags(tags.trim() ? `${tags.replace(/,\s*$/, "")}, ${t}` : t)}>
                  + {t}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, margin: "4px 0 14px" }}>
            {STATUSES.map((s) => (
              <button key={s.key} className={`chip ${status === s.key ? "chip-on" : ""}`} onClick={() => setStatus(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={add} disabled={!title.trim() || busy}>
              {busy ? "Adding…" : "Add to shelf"}
            </button>
            <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
          </div>
          {error && <div style={{ color: "var(--rust)", fontSize: 13, marginTop: 8 }}>{error}</div>}
        </div>
      ) : (
        <button className="btn btn-primary" style={{ width: "100%", marginBottom: 18 }} onClick={() => setAdding(true)}>
          + Add a book
        </button>
      )}

      {allTags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
          <button className={`chip ${!filterTag ? "chip-on" : ""}`} onClick={() => setFilterTag(null)}>
            All
          </button>
          {allTags.map((t) => (
            <button key={t} className={`chip ${filterTag === t ? "chip-on" : ""}`}
              onClick={() => setFilterTag(filterTag === t ? null : t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      {books.length === 0 && !adding && (
        <div style={{ textAlign: "center", padding: "56px 24px", color: "var(--ink-soft)" }}>
          <div className="display" style={{ fontSize: 22, color: "var(--ink)", marginBottom: 8 }}>
            An empty shelf, for now
          </div>
          Add the book you're reading to start collecting notes and quotes.
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: 22 }}>
          <div className="eyebrow section-head" style={{ marginBottom: 10 }}>
            {g.label}
            <span style={{ fontWeight: 400 }}>{g.books.length}</span>
          </div>
          {g.books.map((b) => (
            <button key={b.id} className="spine" onClick={() => onOpen(b.id)}>
              <span className="spine-band" style={{ background: clothFor(b.id) }} />
              <span style={{ flex: 1, textAlign: "left" }}>
                <span className="display" style={{ display: "block", fontSize: 17 }}>{b.title}</span>
                <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                  {b.author || "Unknown author"} · {b.entryCount} {b.entryCount === 1 ? "entry" : "entries"}
                  {b.bookmark ? <span style={{ color: "var(--gilt-deep)", fontWeight: 600 }}> · 🔖 {b.bookmark}</span> : null}
                  {(b.tags || []).length > 0 && <span style={{ fontStyle: "italic" }}> · {b.tags.join(", ")}</span>}
                </span>
              </span>
              <span style={{ color: "var(--gilt)", fontSize: 18 }}>›</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ————— Book view ————— */

function BookView({ book: initialBook, onBack, onBookChanged }) {
  const [book, setBook] = useState(initialBook);
  const [entries, setEntries] = useState(null);
  const [log, setLog] = useState([]);
  const [note, setNote] = useState("");
  const [noteChapter, setNoteChapter] = useState("");
  const [notePage, setNotePage] = useState("");
  const [summary, setSummary] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bookmark, setBookmark] = useState(initialBook.bookmark || "");
  const [showLog, setShowLog] = useState(false);
  const [editingBook, setEditingBook] = useState(false);
  const [bookDraft, setBookDraft] = useState({ title: "", author: "", tags: "" });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ text: "", commentary: "", chapter: "", page: "" });

  useEffect(() => {
    Promise.all([db.listEntries(book.id), db.listLog(book.id)])
      .then(([e, l]) => {
        setEntries(e);
        setLog(l);
      })
      .catch((e) => setError("Couldn't load entries: " + e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guard = (fn) => async (...args) => {
    setError("");
    try {
      await fn(...args);
    } catch (e) {
      setError(e.message);
    }
  };

  const patchBook = guard(async (patch) => {
    const updated = await db.updateBook(book.id, patch);
    setBook((b) => ({ ...b, ...updated }));
    onBookChanged();
  });

  const saveBookmark = guard(async () => {
    const mark = bookmark.trim();
    await db.updateBook(book.id, { bookmark: mark });
    setBook((b) => ({ ...b, bookmark: mark }));
    if (mark) setLog([await db.addLog(book.id, mark), ...log]);
    onBookChanged();
  });

  const addNote = guard(async () => {
    const row = await db.addEntry(book.id, {
      type: "note",
      text: note.trim(),
      chapter: noteChapter.trim(),
      page: notePage.trim(),
    });
    setEntries([row, ...entries]);
    setNote("");
    setNoteChapter("");
    setNotePage("");
  });

  const addQuote = guard(async (q) => {
    const row = await db.addEntry(book.id, q);
    setEntries([row, ...entries]);
  });

  const saveEdit = guard(async (id) => {
    const row = await db.updateEntry(id, {
      text: editDraft.text.trim(),
      commentary: editDraft.commentary.trim(),
      chapter: editDraft.chapter.trim(),
      page: editDraft.page.trim(),
    });
    setEntries(entries.map((e) => (e.id === id ? row : e)));
    setEditingId(null);
  });

  const removeEntry = guard(async (id) => {
    await db.deleteEntry(id);
    setEntries(entries.filter((e) => e.id !== id));
  });

  const removeBook = guard(async () => {
    await db.deleteBook(book.id);
    onBack();
  });

  const summarize = async () => {
    setSummarizing(true);
    setError("");
    try {
      const material = entries
        .map((e) => `[${e.type}${whereLabel(e) ? `, ${whereLabel(e)}` : ""}] ${e.text}${e.commentary ? ` | my commentary: ${e.commentary}` : ""}`)
        .join("\n");
      const text = await askClaude(
        `These are my reading notes and captured quotes from "${book.title}"${book.author ? ` by ${book.author}` : ""}:\n\n${material}\n\nSummarize what I've been taking away from this book. Respond ONLY with JSON, no markdown fences or preamble: {"summary": "2-4 sentence synthesis in second person (what you seem drawn to...)", "keyIdeas": ["3-5 short key ideas"]}`
      );
      setSummary(parseJSON(text));
    } catch (e) {
      setError("Couldn't summarize: " + e.message);
    }
    setSummarizing(false);
  };

  if (entries === null && !error) return <Centered>Opening {book.title}…</Centered>;

  return (
    <div>
      <button className="btn" onClick={onBack} style={{ marginBottom: 14 }}>‹ Library</button>

      <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: `6px solid ${clothFor(book.id)}` }}>
        {editingBook ? (
          <div style={{ marginBottom: 12 }}>
            <input className="field" placeholder="Title" value={bookDraft.title}
              onChange={(e) => setBookDraft({ ...bookDraft, title: e.target.value })} autoFocus />
            <input className="field" placeholder="Author" value={bookDraft.author}
              onChange={(e) => setBookDraft({ ...bookDraft, author: e.target.value })} />
            <input className="field" placeholder="Tags — comma separated, e.g. basketball, memoir" value={bookDraft.tags}
              onChange={(e) => setBookDraft({ ...bookDraft, tags: e.target.value })} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" disabled={!bookDraft.title.trim()}
                onClick={() => { patchBook({ title: bookDraft.title.trim(), author: bookDraft.author.trim(), tags: parseTags(bookDraft.tags) }); setEditingBook(false); }}>
                Save
              </button>
              <button className="btn" onClick={() => setEditingBook(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <h2 className="display" style={{ margin: "0 0 2px", fontSize: 24 }}>{book.title}</h2>
              <div style={{ color: "var(--ink-soft)", fontSize: 14 }}>{book.author || "Unknown author"}</div>
              {(book.tags || []).length > 0 && (
                <div style={{ color: "var(--gilt-deep)", fontSize: 13, fontStyle: "italic", marginTop: 2 }}>
                  {book.tags.join(" · ")}
                </div>
              )}
            </div>
            <button className="chip" onClick={() => { setBookDraft({ title: book.title, author: book.author || "", tags: (book.tags || []).join(", ") }); setEditingBook(true); }}>
              ✎ Edit
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STATUSES.map((s) => (
            <button key={s.key} className={`chip ${book.status === s.key ? "chip-on" : ""}`} onClick={() => patchBook({ status: s.key })}>
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
          <span style={{ fontSize: 16 }} aria-hidden="true">🔖</span>
          <input
            className="field"
            style={{ marginBottom: 0, flex: 1 }}
            placeholder={book.status === "reading" ? "Where are you? e.g. p. 142 or Ch. 7" : "Bookmark (optional)"}
            value={bookmark}
            onChange={(e) => setBookmark(e.target.value)}
          />
          {bookmark !== (book.bookmark || "") && (
            <button className="btn btn-primary" onClick={saveBookmark}>Save</button>
          )}
        </div>

        {log.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button className="eyebrow" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }} onClick={() => setShowLog(!showLog)}>
              Reading log ({log.length}) {showLog ? "▾" : "▸"}
            </button>
            {showLog && (
              <div style={{ marginTop: 8, borderLeft: "2px solid var(--line)", paddingLeft: 12 }}>
                {log.slice(0, 12).map((l) => (
                  <div key={l.id} style={{ fontSize: 13, marginBottom: 4, display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontWeight: 600 }}>🔖 {l.mark}</span>
                    <span style={{ color: "var(--ink-soft)" }}>{fmtWhen(l.at)}</span>
                  </div>
                ))}
                {log.length > 12 && <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>+ {log.length - 12} earlier</div>}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {confirmDelete ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--rust)", flex: 1 }}>
                Remove this book and its {entries.length} {entries.length === 1 ? "entry" : "entries"}?
              </span>
              <button className="chip" style={{ background: "var(--rust)", borderColor: "var(--rust)", color: "#fff" }} onClick={removeBook}>
                Yes, remove
              </button>
              <button className="chip" onClick={() => setConfirmDelete(false)}>Keep</button>
            </div>
          ) : (
            <button className="chip" style={{ color: "var(--rust)", borderColor: "var(--rust)" }} onClick={() => setConfirmDelete(true)}>
              Remove book
            </button>
          )}
        </div>
      </div>

      <QuoteCapture onSave={addQuote} />

      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Add a note</div>
        <textarea className="field" rows={3} placeholder="A thought, reaction, or connection…" value={note} onChange={(e) => setNote(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <input className="field" style={{ flex: 1 }} placeholder="Chapter (optional)" value={noteChapter} onChange={(e) => setNoteChapter(e.target.value)} />
          <input className="field" style={{ flex: 1 }} placeholder="Page (optional)" value={notePage} onChange={(e) => setNotePage(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={!note.trim()} onClick={addNote}>Save note</button>
      </div>

      {entries.length > 1 && (
        <button className="btn btn-gilt" style={{ width: "100%", marginBottom: 12 }} onClick={summarize} disabled={summarizing}>
          {summarizing ? "Reading your marginalia…" : "Summarize my notes on this book"}
        </button>
      )}
      {error && <div style={{ color: "var(--rust)", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {summary && (
        <div className="card" style={{ padding: 16, marginBottom: 16, background: "var(--paper-dim)" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>What you're taking away</div>
          <p style={{ margin: "0 0 10px", lineHeight: 1.55 }}>{summary.summary}</p>
          {(summary.keyIdeas || []).map((k, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 14, marginBottom: 5 }}>
              <span style={{ color: "var(--gilt)" }}>—</span>
              <span>{k}</span>
            </div>
          ))}
        </div>
      )}

      {(entries || []).map((e) => (
        <div key={e.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
          {editingId === e.id ? (
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Editing {e.type}</div>
              <textarea className="field" rows={4} value={editDraft.text} onChange={(ev) => setEditDraft({ ...editDraft, text: ev.target.value })} autoFocus />
              {e.type === "quote" && (
                <textarea className="field" rows={2} placeholder="Your commentary (optional)" value={editDraft.commentary}
                  onChange={(ev) => setEditDraft({ ...editDraft, commentary: ev.target.value })} />
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <input className="field" style={{ flex: 1 }} placeholder="Chapter (optional)" value={editDraft.chapter}
                  onChange={(ev) => setEditDraft({ ...editDraft, chapter: ev.target.value })} />
                <input className="field" style={{ flex: 1 }} placeholder="Page (optional)" value={editDraft.page}
                  onChange={(ev) => setEditDraft({ ...editDraft, page: ev.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" disabled={!editDraft.text.trim()} onClick={() => saveEdit(e.id)}>Save changes</button>
                <button className="btn" onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, gap: 8 }}>
                <span className="eyebrow" style={{ color: e.type === "quote" ? "var(--gilt-deep)" : "var(--ink-soft)" }}>
                  {e.type === "quote" ? "Quote" : "Note"}
                  {whereLabel(e) ? ` · ${whereLabel(e)}` : ""}
                </span>
                <span style={{ display: "flex", alignItems: "baseline", gap: 12, whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                    {fmtWhen(e.created_at)}
                    {e.edited_at ? " · edited" : ""}
                  </span>
                  <button
                    onClick={() => {
                      setEditDraft({ text: e.text, commentary: e.commentary || "", chapter: e.chapter || "", page: e.page || "" });
                      setEditingId(e.id);
                    }}
                    style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer", fontSize: 13, padding: 0 }}
                    aria-label="Edit entry"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => removeEntry(e.id)}
                    style={{ background: "none", border: "none", color: "var(--ink-soft)", cursor: "pointer", fontSize: 13, padding: 0 }}
                    aria-label="Delete entry"
                  >
                    ✕
                  </button>
                </span>
              </div>
              {e.type === "quote" ? (
                <>
                  <p className="display" style={{ margin: 0, fontStyle: "italic", fontSize: 16.5, lineHeight: 1.55 }}>
                    “{e.text}”
                  </p>
                  {e.commentary && (
                    <div style={{ marginTop: 10, paddingLeft: 10, borderLeft: "3px solid var(--gilt)", fontSize: 14, lineHeight: 1.5 }}>
                      {e.commentary}
                    </div>
                  )}
                </>
              ) : (
                <p style={{ margin: 0, lineHeight: 1.55, fontSize: 15 }}>{e.text}</p>
              )}
            </>
          )}
        </div>
      ))}

      {(entries || []).length === 0 && (
        <div style={{ textAlign: "center", color: "var(--ink-soft)", padding: "24px 12px", fontSize: 14 }}>
          Nothing captured yet. Photograph a page or jot a note above.
        </div>
      )}
    </div>
  );
}

/* ————— Photo → quote ————— */

function QuoteCapture({ onSave }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const img = await fileToImagePayload(file);
      const text = await askClaude([
        { type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } },
        {
          type: "text",
          text: 'This is a photo of a book page. Transcribe the passage — if part of the text is highlighted, underlined, or bracketed, transcribe only that part; otherwise transcribe the main visible passage. If it is very long, transcribe at most the first 200 words. Fix hyphenation across line breaks. Respond ONLY with JSON, no markdown fences or preamble: {"page": "page number if visible, else null", "text": "the transcribed passage"}',
        },
      ]);
      let parsed;
      try {
        parsed = parseJSON(text);
      } catch {
        const raw = text.replace(/```json|```/g, "").trim();
        const m = raw.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)/);
        const pg = raw.match(/"page"\s*:\s*"?([\w-]+)"?/);
        parsed = {
          text: m ? m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : raw,
          page: pg && pg[1] !== "null" ? pg[1] : "",
        };
      }
      if (!parsed.text || !String(parsed.text).trim()) throw new Error("No readable text was found in the photo.");
      setDraft({ text: String(parsed.text), page: parsed.page || "", chapter: "", commentary: "" });
    } catch (e) {
      setError("Transcription failed: " + e.message);
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Capture a quote</div>

      {!draft && (
        <>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files[0])} />
          <button className="btn btn-gilt" style={{ width: "100%" }} disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Transcribing the page…" : "📷 Photograph a page"}
          </button>
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 8 }}>
            Snap the passage — highlighted or underlined text is picked out automatically. You can edit before saving.
          </div>
        </>
      )}

      {error && <div style={{ color: "var(--rust)", fontSize: 13, marginTop: 8 }}>{error}</div>}

      {draft && (
        <div>
          <textarea className="field" rows={5} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          <textarea className="field" rows={2} placeholder="Your commentary — why this passage matters to you (optional)"
            value={draft.commentary} onChange={(e) => setDraft({ ...draft, commentary: e.target.value })} />
          <div style={{ display: "flex", gap: 8 }}>
            <input className="field" style={{ flex: 1 }} placeholder="Chapter (optional)" value={draft.chapter}
              onChange={(e) => setDraft({ ...draft, chapter: e.target.value })} />
            <input className="field" style={{ flex: 1 }} placeholder="Page (optional)" value={draft.page}
              onChange={(e) => setDraft({ ...draft, page: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" disabled={!draft.text.trim()}
              onClick={() => {
                onSave({
                  type: "quote",
                  text: draft.text.trim(),
                  commentary: draft.commentary.trim(),
                  page: String(draft.page || "").trim(),
                  chapter: String(draft.chapter || "").trim(),
                });
                setDraft(null);
              }}>
              Save quote
            </button>
            <button className="btn" onClick={() => setDraft(null)}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ————— Threads ————— */

function Threads() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [threads, setThreads] = useState(undefined);
  const [shelf, setShelf] = useState([]);
  const [selTags, setSelTags] = useState([]);
  const [selBooks, setSelBooks] = useState([]);
  const [pickBooks, setPickBooks] = useState(false);

  useEffect(() => {
    db.latestSynthesis()
      .then((row) => setThreads(row ? { ...row.payload, generatedAt: row.created_at } : null))
      .catch((e) => setError("Couldn't load past syntheses: " + e.message));
    db.allEntriesByBook()
      .then(setShelf)
      .catch(() => {});
  }, []);

  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const allTags = tagsOf(shelf);
  const scoped = (list) =>
    selTags.length || selBooks.length
      ? list.filter((b) => selBooks.includes(b.id) || (b.tags || []).some((t) => selTags.includes(t)))
      : list;

  const weave = async () => {
    setBusy(true);
    setError("");
    try {
      const books = scoped(await db.allEntriesByBook());
      if (books.length === 0)
        throw new Error(
          selTags.length || selBooks.length
            ? "No books with notes match your selection."
            : "Add notes or quotes to at least one book first."
        );
      const material = books
        .map((b) => {
          const lines = (b.entries || [])
            .map((e) => `  - (${e.type}${whereLabel(e) ? `, ${whereLabel(e)}` : ""}) ${e.text}${e.commentary ? ` | my commentary: ${e.commentary}` : ""}`)
            .join("\n");
          return `BOOK: "${b.title}"${b.author ? ` by ${b.author}` : ""}\n${lines}`;
        })
        .join("\n\n");
      const text = await askClaude(
        `Here are my notes and quotes across the books I'm reading:\n\n${material}\n\nFind the common themes that run across multiple books and synthesize them. Prefer themes that connect 2+ books; a theme from one book is fine only if it's clearly central. Respond ONLY with JSON, no markdown fences or preamble: {"overview": "2-3 sentences on the throughline of my reading, in second person", "themes": [{"name": "short theme name", "synthesis": "2-3 sentences weaving the books' takes together", "sources": [{"book": "title", "excerpt": "short paraphrase or fragment of the relevant note/quote"}]}]}. 3-5 themes max.`
      );
      const payload = parseJSON(text);
      const row = await db.saveSynthesis(payload);
      setThreads({ ...payload, generatedAt: row.created_at });
    } catch (e) {
      setError("The weave didn't come together: " + e.message);
    }
    setBusy(false);
  };

  const t = threads;

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Threads</div>
        <p style={{ margin: "0 0 12px", fontSize: 14.5, lineHeight: 1.5, color: "var(--ink-soft)" }}>
          Pulls notes and quotes off your shelf and stitches them into shared themes across books. Narrow the weave by
          tag or book, or leave everything unselected to weave the whole shelf.
        </p>

        {allTags.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Tags</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {allTags.map((tag) => (
                <button key={tag} className={`chip ${selTags.includes(tag) ? "chip-on" : ""}`}
                  onClick={() => toggle(selTags, setSelTags, tag)}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {shelf.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <button className="eyebrow" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onClick={() => setPickBooks(!pickBooks)}>
              Books ({selBooks.length ? `${selBooks.length} picked` : "all"}) {pickBooks ? "▾" : "▸"}
            </button>
            {pickBooks && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {shelf.map((b) => (
                  <button key={b.id} className={`chip ${selBooks.includes(b.id) ? "chip-on" : ""}`}
                    onClick={() => toggle(selBooks, setSelBooks, b.id)}>
                    {b.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button className="btn btn-gilt" style={{ width: "100%" }} onClick={weave} disabled={busy}>
          {busy
            ? "Weaving your notes together…"
            : selTags.length || selBooks.length
            ? `Weave ${scoped(shelf).length} ${scoped(shelf).length === 1 ? "book" : "books"} into themes`
            : t
            ? "Re-weave with latest notes"
            : "Weave my notes into themes"}
        </button>
        {error && <div style={{ color: "var(--rust)", fontSize: 13, marginTop: 8 }}>{error}</div>}
      </div>

      {t && (
        <>
          <p className="display" style={{ fontSize: 18, lineHeight: 1.5, margin: "0 4px 20px" }}>{t.overview}</p>
          <div className="thread-line">
            {(t.themes || []).map((th, i) => (
              <div key={i} className="thread-node">
                <div className="thread-dot" />
                <div className="card" style={{ padding: 14 }}>
                  <div className="display" style={{ fontSize: 18, marginBottom: 6 }}>{th.name}</div>
                  <p style={{ margin: "0 0 10px", fontSize: 14.5, lineHeight: 1.55 }}>{th.synthesis}</p>
                  {(th.sources || []).map((s, j) => (
                    <div key={j} style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 4, lineHeight: 1.45 }}>
                      <span style={{ color: "var(--gilt-deep)", fontWeight: 600 }}>{s.book}</span> — {s.excerpt}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", textAlign: "center", marginTop: 14 }}>
            Woven {new Date(t.generatedAt).toLocaleString()}
          </div>
        </>
      )}
    </div>
  );
}

/* ————— Settings ————— */

function Settings() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email || ""));
  }, []);

  const run = async () => {
    setRunning(true);
    const out = {};
    try {
      const { error } = await supabase.from("books").select("id").limit(1);
      out.storage = error ? "✗ " + error.message : "✓ working";
    } catch (e) {
      out.storage = "✗ " + e.message;
    }
    try {
      const t = await askClaude([{ type: "text", text: "Reply with the single word: ok" }], 20);
      out.api = t ? "✓ working" : "✗ empty response";
    } catch (e) {
      out.api = "✗ " + e.message;
    }
    setResult(out);
    setRunning(false);
  };

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Account</div>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--ink-soft)" }}>
          Signed in as <strong style={{ color: "var(--ink)" }}>{email}</strong>. Your library syncs to this account.
        </p>
        <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Connection check</div>
        <p style={{ margin: "0 0 4px", fontSize: 14, lineHeight: 1.5, color: "var(--ink-soft)" }}>
          Tests whether sync and AI features (quote transcription, summaries, Threads) are working.
        </p>
        <div style={{ marginTop: 10 }}>
          <button className="chip" onClick={run} disabled={running}>
            {running ? "Checking…" : "Run connection check"}
          </button>
          {result && (
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 8, lineHeight: 1.6 }}>
              <div>Sync: {result.storage}</div>
              <div>Transcription &amp; synthesis: {result.api}</div>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>About</div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--ink-soft)" }}>
          Commonplace keeps your books, notes, quotes, and reading log synced to your account. Page photos are used
          only to transcribe text and are never stored.
        </p>
      </div>
    </div>
  );
}
