/// <reference types="vite/client" />
import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { GoogleUserProfile, UserActivityItem } from "./auth";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ""
).trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export interface QodnProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  profile_completed: boolean;
  auth_provider: string;
  last_sign_in_at: string;
  created_at: string;
  updated_at: string;
}

export interface QodnUsageLogRow {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  mode: string | null;
  file_name: string | null;
  entity_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function mapSupabaseUserToProfile(
  sbUser: User,
  row?: QodnProfileRow | null,
): GoogleUserProfile {
  const meta = (sbUser.user_metadata || {}) as Record<string, unknown>;
  const email = (row?.email || sbUser.email || "").trim().toLowerCase();
  const fullName =
    row?.full_name ||
    (typeof meta.full_name === "string" ? meta.full_name : "") ||
    (typeof meta.name === "string" ? meta.name : "") ||
    email.split("@")[0] ||
    "QuickODN User";

  const given =
    row?.first_name ||
    (typeof meta.given_name === "string" ? meta.given_name : "") ||
    fullName.split(" ")[0] ||
    "";
  const family =
    row?.last_name ||
    (typeof meta.family_name === "string" ? meta.family_name : "") ||
    fullName.split(" ").slice(1).join(" ") ||
    "";

  return {
    sub: sbUser.id,
    email,
    name: fullName,
    givenName: given || undefined,
    familyName: family || undefined,
    firstName: row?.first_name || given || undefined,
    lastName: row?.last_name || family || undefined,
    companyName: row?.company_name || undefined,
    profileCompleted: Boolean(row?.profile_completed),
    picture:
      row?.avatar_url ||
      (typeof meta.avatar_url === "string" ? meta.avatar_url : undefined) ||
      (typeof meta.picture === "string" ? meta.picture : undefined),
    emailVerified: Boolean(sbUser.email_confirmed_at || meta.email_verified),
    authMethod: "google_oauth",
    signedInAt: row?.last_sign_in_at || new Date().toISOString(),
  };
}

export async function getActiveSupabaseSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session ?? null;
}

export async function signInWithSupabaseGoogle(loginHint?: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "Supabase is not configured." };
  const queryParams: Record<string, string> = {
    access_type: "offline",
    prompt: "select_account",
  };
  if (loginHint) {
    queryParams.login_hint = loginHint;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
      queryParams,
    },
  });
  if (error) return { error: error.message };
  return {};
}

export async function signInWithSupabaseGoogleIdToken(
  idToken: string,
): Promise<{ user: User | null; error?: string }> {
  if (!supabase) return { user: null, error: "Supabase is not configured." };
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });
  if (error) return { user: null, error: error.message };
  return { user: data.user ?? null };
}

export async function signOutSupabase(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Ignore sign-out errors
  }
}

export async function fetchQodnProfile(userId: string): Promise<QodnProfileRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("qodn_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as QodnProfileRow;
}

export async function upsertQodnProfile(
  userId: string,
  profile: Partial<GoogleUserProfile> & { email: string },
): Promise<QodnProfileRow | null> {
  if (!supabase) return null;
  const payload = {
    id: userId,
    email: profile.email.trim().toLowerCase(),
    full_name: profile.name || null,
    first_name: profile.firstName || profile.givenName || null,
    last_name: profile.lastName || profile.familyName || null,
    company_name: profile.companyName || null,
    avatar_url: profile.picture || null,
    profile_completed: Boolean(profile.profileCompleted),
    auth_provider: profile.authMethod || "google",
    last_sign_in_at: profile.signedInAt || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("qodn_profiles")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();
  if (error || !data) return null;
  return data as QodnProfileRow;
}

export async function fetchQodnHistory(userId: string, limit = 100): Promise<UserActivityItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("qodn_conversion_history")
    .select("id, created_at, user_email, event, mode, provider, file_name, item_count, summary")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    timestamp: row.created_at,
    userEmail: row.user_email,
    event: row.event,
    mode: row.mode,
    provider: row.provider ?? undefined,
    fileName: row.file_name,
    itemCount: row.item_count ?? 0,
    summary: row.summary ?? "",
  }));
}

export async function insertQodnHistory(
  userId: string,
  entry: Omit<UserActivityItem, "id" | "timestamp">,
): Promise<UserActivityItem | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("qodn_conversion_history")
    .insert({
      user_id: userId,
      user_email: entry.userEmail,
      event: entry.event,
      mode: entry.mode,
      provider: entry.provider ?? null,
      file_name: entry.fileName,
      item_count: entry.itemCount,
      summary: entry.summary,
    })
    .select("id, created_at, user_email, event, mode, provider, file_name, item_count, summary")
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    timestamp: data.created_at,
    userEmail: data.user_email,
    event: data.event,
    mode: data.mode,
    provider: data.provider ?? undefined,
    fileName: data.file_name,
    itemCount: data.item_count ?? 0,
    summary: data.summary ?? "",
  };
}

export async function clearQodnHistory(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from("qodn_conversion_history")
    .delete()
    .eq("user_id", userId);
  return !error;
}

export async function insertQodnUsageLog(
  userId: string,
  params: {
    userEmail: string;
    action: string;
    mode?: string;
    fileName?: string;
    entityCount?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("qodn_usage_logs").insert({
      user_id: userId,
      user_email: params.userEmail,
      action: params.action,
      mode: params.mode ?? null,
      file_name: params.fileName ?? null,
      entity_count: params.entityCount ?? 0,
      metadata: params.metadata ?? {},
    });
  } catch {
    // Non-blocking telemetry insert
  }
}

export async function fetchQodnUsageLogs(userId: string, limit = 50): Promise<QodnUsageLogRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("qodn_usage_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as QodnUsageLogRow[];
}


export interface QodnHistoryRow {
  id: string;
  user_id: string;
  user_email: string;
  event: string;
  mode: string;
  provider: string | null;
  file_name: string;
  item_count: number;
  summary: string;
  created_at: string;
}

export async function checkSupabaseAdminRole(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return false;
  return data.user.app_metadata?.role === "admin";
}

export async function fetchAllQodnProfilesAdmin(): Promise<{ rows: QodnProfileRow[]; error?: string }> {
  if (!supabase) return { rows: [], error: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("qodn_profiles")
    .select("*")
    .order("last_sign_in_at", { ascending: false });
  if (error) return { rows: [], error: error.message };
  return { rows: (data || []) as QodnProfileRow[] };
}

export async function fetchAllQodnUsageLogsAdmin(limit = 300): Promise<{ rows: QodnUsageLogRow[]; error?: string }> {
  if (!supabase) return { rows: [], error: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("qodn_usage_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { rows: [], error: error.message };
  return { rows: (data || []) as QodnUsageLogRow[] };
}

export async function fetchAllQodnHistoryAdmin(limit = 300): Promise<{ rows: QodnHistoryRow[]; error?: string }> {
  if (!supabase) return { rows: [], error: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("qodn_conversion_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { rows: [], error: error.message };
  return { rows: (data || []) as QodnHistoryRow[] };
}
