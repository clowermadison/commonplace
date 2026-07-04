import { supabase } from "./supabase";

/* Data access layer. RLS on the Supabase side scopes everything to the
   signed-in user; user_id is stamped on insert. */

async function uidOrThrow() {
  const { data } = await supabase.auth.getUser();
  if (!data?.user) throw new Error("Not signed in");
  return data.user.id;
}

export async function listBooks() {
  const { data, error } = await supabase
    .from("books")
    .select("*, entries(count)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((b) => ({ ...b, entryCount: b.entries?.[0]?.count ?? 0 }));
}

export async function addBook({ title, author, status, tags = [] }) {
  const user_id = await uidOrThrow();
  const { data, error } = await supabase
    .from("books")
    .insert({ user_id, title, author, status, tags })
    .select()
    .single();
  if (error) throw error;
  return { ...data, entryCount: 0 };
}

export async function updateBook(id, patch) {
  const { data, error } = await supabase.from("books").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteBook(id) {
  const { error } = await supabase.from("books").delete().eq("id", id);
  if (error) throw error;
}

export async function listEntries(bookId) {
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addEntry(bookId, entry) {
  const user_id = await uidOrThrow();
  const { data, error } = await supabase
    .from("entries")
    .insert({ user_id, book_id: bookId, ...entry })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEntry(id, patch) {
  const { data, error } = await supabase
    .from("entries")
    .update({ ...patch, edited_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEntry(id) {
  const { error } = await supabase.from("entries").delete().eq("id", id);
  if (error) throw error;
}

export async function listLog(bookId) {
  const { data, error } = await supabase
    .from("reading_log")
    .select("*")
    .eq("book_id", bookId)
    .order("at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function addLog(bookId, mark) {
  const user_id = await uidOrThrow();
  const { data, error } = await supabase
    .from("reading_log")
    .insert({ user_id, book_id: bookId, mark })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function latestSynthesis() {
  const { data, error } = await supabase
    .from("syntheses")
    .select("*")
    .eq("kind", "threads")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0] || null;
}

export async function saveSynthesis(payload) {
  const user_id = await uidOrThrow();
  const { data, error } = await supabase
    .from("syntheses")
    .insert({ user_id, payload })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ————— Journal ————— */

export async function listJournal() {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("*, books(title)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function journalSince(iso) {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("*, books(title)")
    .gte("created_at", iso)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function addJournalEntry({ text, book_id = null, prompt = "" }) {
  const user_id = await uidOrThrow();
  const { data, error } = await supabase
    .from("journal_entries")
    .insert({ user_id, text, book_id, prompt })
    .select("*, books(title)")
    .single();
  if (error) throw error;
  return data;
}

export async function updateJournalEntry(id, patch) {
  const { data, error } = await supabase
    .from("journal_entries")
    .update({ ...patch, edited_at: new Date().toISOString() })
    .eq("id", id)
    .select("*, books(title)")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteJournalEntry(id) {
  const { error } = await supabase.from("journal_entries").delete().eq("id", id);
  if (error) throw error;
}

/* Recent notes, quotes, and bookmark moves — context for prompts and recaps. */
export async function activitySince(iso) {
  const [entries, log] = await Promise.all([
    supabase
      .from("entries")
      .select("type, text, commentary, created_at, books(title)")
      .gte("created_at", iso)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("reading_log")
      .select("mark, at, books(title)")
      .gte("at", iso)
      .order("at", { ascending: false })
      .limit(40),
  ]);
  if (entries.error) throw entries.error;
  if (log.error) throw log.error;
  return { entries: entries.data, log: log.data };
}

export async function listRecaps() {
  const { data, error } = await supabase
    .from("syntheses")
    .select("*")
    .eq("kind", "recap")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function saveRecap(payload) {
  const user_id = await uidOrThrow();
  const { data, error } = await supabase
    .from("syntheses")
    .insert({ user_id, payload, kind: "recap" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* Everything a synthesis needs, in one query. */
export async function allEntriesByBook() {
  const { data, error } = await supabase
    .from("books")
    .select("id, title, author, tags, entries(id, type, text, commentary, chapter, page)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.filter((b) => (b.entries || []).length > 0);
}
