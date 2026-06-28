import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const SUPABASE_URL = "https://svbsrgxqgzuibrrsywix.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_SnnCYLyAFpFHb7yUayFsPg_vMI4qXW7";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export function initializeApp() {
  return supabase;
}

export function getSupabase() {
  return supabase;
}

export function getAuth() {
  return supabase.auth;
}

function wrapUser(user) {
  if (!user) return null;
  return {
    ...user,
    uid: user.id,
    displayName: user.user_metadata?.displayName || user.user_metadata?.name || "",
    async getIdToken() {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token || "";
    }
  };
}

export async function signInWithEmailAndPassword(auth, email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { user: wrapUser(data.user) };
}

export async function createUserWithEmailAndPassword(auth, email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { user: wrapUser(data.user) };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser(timeoutMs = 5000) {
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Auth session timeout")), timeoutMs)
      )
    ]);
    return wrapUser(result.data?.session?.user || null);
  } catch (err) {
    console.warn("getCurrentUser failed:", err);
    return null;
  }
}

export async function onAuthStateChanged(auth, callback) {
  try {
    const user = await getCurrentUser(5000);
    await callback(user);
  } catch (err) {
    console.warn("Initial auth callback failed:", err);
    await callback(null);
  }

  const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
    try {
      await callback(wrapUser(session?.user || null));
    } catch (err) {
      console.warn("Auth state callback failed:", err);
    }
  });
  return () => listener.subscription.unsubscribe();
}

export function collection(db, name) {
  return { type: "collection", name, constraints: [] };
}

export function doc(db, name, id) {
  return { type: "doc", name, id };
}

export function where(field, op, value) {
  return { type: "where", field, op, value };
}

export function orderBy(field, direction = "asc") {
  return { type: "orderBy", field, direction };
}

export function limit(count) {
  return { type: "limit", count };
}

export function query(ref, ...constraints) {
  return { ...ref, constraints: [...(ref.constraints || []), ...constraints] };
}

export function arrayUnion(...values) {
  return { __op: "arrayUnion", values };
}

export function arrayRemove(...values) {
  return { __op: "arrayRemove", values };
}

export function serverTimestamp() {
  return new Date().toISOString();
}

function unpack(row) {
  if (!row) return null;
  return { id: row.id, ...(row.data || {}) };
}

function pack(id, data) {
  const clean = { ...(data || {}) };
  delete clean.id;
  return { id, data: clean, updated_at: new Date().toISOString() };
}

function getValue(row, field) {
  if (field === "id") return row.id;
  return row[field] ?? row.data?.[field];
}

function applyConstraints(rows, constraints = []) {
  let result = rows.map(unpack);
  constraints.filter(c => c.type === "where").forEach(c => {
    result = result.filter(row => {
      const value = getValue(row, c.field);
      if (c.op === "==") return value === c.value;
      if (c.op === "!=") return value !== c.value;
      if (c.op === ">") return value > c.value;
      if (c.op === ">=") return value >= c.value;
      if (c.op === "<") return value < c.value;
      if (c.op === "<=") return value <= c.value;
      if (c.op === "array-contains") return Array.isArray(value) && value.includes(c.value);
      return true;
    });
  });
  constraints.filter(c => c.type === "orderBy").forEach(c => {
    result.sort((a, b) => {
      const av = getValue(a, c.field);
      const bv = getValue(b, c.field);
      const dir = String(c.direction).toLowerCase() === "desc" ? -1 : 1;
      return String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true }) * dir;
    });
  });
  const limiter = constraints.find(c => c.type === "limit");
  if (limiter) result = result.slice(0, limiter.count);
  return result;
}

function docSnapshot(data) {
  return {
    id: data?.id,
    exists: () => !!data,
    data: () => data || null
  };
}

function querySnapshot(rows) {
  return {
    empty: rows.length === 0,
    size: rows.length,
    docs: rows.map(row => ({ id: row.id, data: () => row })),
    forEach(callback) {
      this.docs.forEach(callback);
    }
  };
}

export async function getDoc(ref) {
  const { data, error } = await supabase.from(ref.name).select("*").eq("id", ref.id).maybeSingle();
  if (error) throw error;
  return docSnapshot(unpack(data));
}

export async function getDocs(ref) {
  const { data, error } = await supabase.from(ref.name).select("*");
  if (error) throw error;
  return querySnapshot(applyConstraints(data || [], ref.constraints || []));
}

export async function setDoc(ref, data, options = {}) {
  const existing = options.merge ? (await getDoc(ref)).data() : null;
  const merged = options.merge && existing ? { ...existing, ...data } : data;
  const { error } = await supabase.from(ref.name).upsert(pack(ref.id, merged));
  if (error) throw error;
}

export async function addDoc(ref, data) {
  const id = data.id || crypto.randomUUID();
  const { error } = await supabase.from(ref.name).insert({ ...pack(id, data), created_at: new Date().toISOString() });
  if (error) throw error;
  return { id };
}

export async function updateDoc(ref, data) {
  const snap = await getDoc(ref);
  const current = snap.data() || {};
  const next = { ...current };
  Object.entries(data || {}).forEach(([key, value]) => {
    if (value?.__op === "arrayUnion") {
      next[key] = [...new Set([...(Array.isArray(next[key]) ? next[key] : []), ...value.values])];
    } else if (value?.__op === "arrayRemove") {
      next[key] = (Array.isArray(next[key]) ? next[key] : []).filter(item => !value.values.includes(item));
    } else {
      next[key] = value;
    }
  });
  await setDoc(ref, next, { merge: false });
}

export async function deleteDoc(ref) {
  const { error } = await supabase.from(ref.name).delete().eq("id", ref.id);
  if (error) throw error;
}

export function onSnapshot(ref, callback) {
  getDocs(ref).then(callback).catch(console.error);
  const channel = supabase
    .channel(`${ref.name}-changes`)
    .on("postgres_changes", { event: "*", schema: "public", table: ref.name }, async () => callback(await getDocs(ref)))
    .subscribe();
  return () => supabase.removeChannel(channel);
}
