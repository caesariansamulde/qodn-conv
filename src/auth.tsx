import React, { useEffect, useRef, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock,
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  History,
  Layers3,
  Loader2,
  LogOut,
  Mail,
  Route,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import {
  fetchQodnProfile,
  isSupabaseConfigured,
  mapSupabaseUserToProfile,
  signInWithSupabaseGoogle,
  signOutSupabase,
  supabase,
  upsertQodnProfile,
} from "./supabaseDb";

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string; select_by?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              width?: number;
              logo_alignment?: "left" | "center";
            },
          ) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (tokenResponse: { access_token?: string; error?: string }) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

export interface GoogleUserProfile {
  sub: string;
  email: string;
  name: string;
  givenName?: string;
  familyName?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  profileCompleted?: boolean;
  picture?: string;
  emailVerified?: boolean;
  hd?: string;
  authMethod: "google_gis" | "google_oauth" | "google_account";
  signedInAt: string;
}

export interface UserOnboardingInfo {
  firstName: string;
  lastName: string;
  companyName: string;
  updatedAt: string;
}

export interface UserActivityItem {
  id: string;
  timestamp: string;
  userEmail: string;
  event: string;
  mode: "hld_nap" | "pole_survey" | "excel_pic" | string;
  provider?: string;
  fileName: string;
  itemCount: number;
  summary: string;
}

const STORAGE_CURRENT_USER = "qodn_google_auth_user_v1";
const STORAGE_SAVED_ACCOUNTS = "qodn_google_saved_accounts_v1";
const STORAGE_CLIENT_ID = "qodn_google_oauth_client_id_v1";
const STORAGE_ACTIVITY_PREFIX = "qodn_user_activity_v1_";
const STORAGE_ONBOARDING_PROFILES = "qodn_user_onboarding_profiles_v1";

export function getSavedOnboardingProfile(email?: string): UserOnboardingInfo | null {
  if (!email) return null;
  try {
    const raw = localStorage.getItem(STORAGE_ONBOARDING_PROFILES);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, UserOnboardingInfo>;
    return map[email.toLowerCase()] || null;
  } catch {
    return null;
  }
}

export function saveUserOnboardingProfile(
  user: GoogleUserProfile,
  info: { firstName: string; lastName: string; companyName: string },
): GoogleUserProfile {
  const cleanFirst = info.firstName.trim();
  const cleanLast = info.lastName.trim();
  const cleanCompany = info.companyName.trim();
  const fullName = `${cleanFirst} ${cleanLast}`.trim() || user.name;

  try {
    const raw = localStorage.getItem(STORAGE_ONBOARDING_PROFILES);
    const map: Record<string, UserOnboardingInfo> = raw ? JSON.parse(raw) : {};
    map[user.email.toLowerCase()] = {
      firstName: cleanFirst,
      lastName: cleanLast,
      companyName: cleanCompany,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_ONBOARDING_PROFILES, JSON.stringify(map));
  } catch {}

  const updatedUser: GoogleUserProfile = {
    ...user,
    name: fullName,
    givenName: cleanFirst,
    familyName: cleanLast,
    firstName: cleanFirst,
    lastName: cleanLast,
    companyName: cleanCompany,
    profileCompleted: true,
  };
  saveCurrentGoogleUser(updatedUser);
  if (supabase) {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        void upsertQodnProfile(data.user.id, updatedUser);
      }
    });
  }
  return updatedUser;
}

function hydrateUserWithOnboarding(user: GoogleUserProfile): GoogleUserProfile {
  const saved = getSavedOnboardingProfile(user.email);
  if (saved && saved.firstName && saved.lastName && saved.companyName) {
    return {
      ...user,
      name: `${saved.firstName} ${saved.lastName}`.trim(),
      givenName: saved.firstName,
      familyName: saved.lastName,
      firstName: saved.firstName,
      lastName: saved.lastName,
      companyName: saved.companyName,
      profileCompleted: true,
    };
  }
  if (user.firstName && user.lastName && user.companyName && user.profileCompleted) {
    return user;
  }
  return {
    ...user,
    profileCompleted: false,
  };
}

// Shared Google OAuth 2.0 Web Client ID from Kasbel Workspace
export const KASBEL_GOOGLE_CLIENT_ID =
  "697128079103-3f8kfb4ih19kpgd51tadn8giklrvus9q.apps.googleusercontent.com";

export function getGoogleClientId(): string {
  try {
    const saved = localStorage.getItem(STORAGE_CLIENT_ID)?.trim();
    if (saved) return saved;
    const envClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
    if (envClientId && typeof envClientId === "string" && envClientId.trim()) {
      return envClientId.trim();
    }
    return KASBEL_GOOGLE_CLIENT_ID;
  } catch {
    return KASBEL_GOOGLE_CLIENT_ID;
  }
}

export function saveGoogleClientId(clientId: string): void {
  try {
    const trimmed = clientId.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_CLIENT_ID, trimmed);
    } else {
      localStorage.removeItem(STORAGE_CLIENT_ID);
    }
  } catch {}
}

function consumeUrlGoogleAuthProfile(): GoogleUserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const encoded = url.searchParams.get("google_auth_profile");
    if (!encoded) return null;
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    const parsed = JSON.parse(jsonStr) as GoogleUserProfile;
    url.searchParams.delete("google_auth_profile");
    url.searchParams.delete("google_auth_error");
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    if (parsed && parsed.email && parsed.name) {
      const hydrated = hydrateUserWithOnboarding(parsed);
      saveCurrentGoogleUser(hydrated);
      return hydrated;
    }
  } catch {}
  return null;
}

export function getCurrentGoogleUser(): GoogleUserProfile | null {
  const fromCallback = consumeUrlGoogleAuthProfile();
  if (fromCallback) return fromCallback;
  try {
    const raw = localStorage.getItem(STORAGE_CURRENT_USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GoogleUserProfile;
    if (parsed && parsed.email && parsed.name) {
      return hydrateUserWithOnboarding(parsed);
    }
  } catch {}
  return null;
}

export function saveCurrentGoogleUser(user: GoogleUserProfile): void {
  try {
    const hydrated = hydrateUserWithOnboarding(user);
    localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(hydrated));
    const existing = getSavedGoogleAccounts();
    const filtered = existing.filter((a) => a.email.toLowerCase() !== hydrated.email.toLowerCase());
    localStorage.setItem(STORAGE_SAVED_ACCOUNTS, JSON.stringify([hydrated, ...filtered].slice(0, 6)));
  } catch {}
}

export async function signOutGoogleUser(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_CURRENT_USER);
    if (window.google?.accounts?.id?.disableAutoSelect) {
      window.google.accounts.id.disableAutoSelect();
    }
  } catch {}
  await signOutSupabase();
}

export function getSavedGoogleAccounts(): GoogleUserProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_SAVED_ACCOUNTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

export function removeSavedGoogleAccount(email: string): GoogleUserProfile[] {
  try {
    const next = getSavedGoogleAccounts().filter((a) => a.email.toLowerCase() !== email.toLowerCase());
    localStorage.setItem(STORAGE_SAVED_ACCOUNTS, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export function getUserActivityHistory(email?: string): UserActivityItem[] {
  if (!email) return [];
  try {
    const key = `${STORAGE_ACTIVITY_PREFIX}${email.toLowerCase()}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

export function appendUserActivityHistory(
  email: string | undefined,
  entry: Omit<UserActivityItem, "id" | "timestamp" | "userEmail">,
): UserActivityItem[] {
  if (!email) return [];
  try {
    const key = `${STORAGE_ACTIVITY_PREFIX}${email.toLowerCase()}`;
    const existing = getUserActivityHistory(email);
    const newItem: UserActivityItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      userEmail: email.toLowerCase(),
      ...entry,
    };
    const updated = [newItem, ...existing].slice(0, 100);
    localStorage.setItem(key, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function clearUserActivityHistory(email?: string): void {
  if (!email) return;
  try {
    const key = `${STORAGE_ACTIVITY_PREFIX}${email.toLowerCase()}`;
    localStorage.removeItem(key);
  } catch {}
}

export function decodeGoogleJwt(jwtToken: string): GoogleUserProfile | null {
  try {
    const parts = jwtToken.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    const payload = JSON.parse(jsonPayload);
    if (!payload.email) return null;
    return {
      sub: payload.sub || `gis-${Date.now()}`,
      email: payload.email,
      name: payload.name || payload.email.split("@")[0],
      givenName: payload.given_name,
      familyName: payload.family_name,
      picture: payload.picture,
      emailVerified: Boolean(payload.email_verified),
      hd: payload.hd,
      authMethod: "google_gis",
      signedInAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function GoogleLogoSvg({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

export function UserAvatar({
  user,
  size = 34,
}: {
  user: Pick<GoogleUserProfile, "name" | "email" | "picture">;
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const initials = (user.name || user.email || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  if (user.picture && !imgError) {
    return (
      <img
        src={user.picture}
        alt={user.name}
        onError={() => setImgError(true)}
        referrerPolicy="no-referrer"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          border: "1.5px solid rgba(255,255,255,0.22)",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #2563eb 0%, #0284c7 100%)",
        color: "#ffffff",
        fontWeight: 700,
        fontSize: Math.max(11, Math.round(size * 0.4)),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        border: "1.5px solid rgba(255,255,255,0.2)",
        letterSpacing: "-0.02em",
      }}
    >
      {initials || "G"}
    </div>
  );
}

interface GoogleLoginScreenProps {
  onSuccess: (user: GoogleUserProfile) => void;
  onOpenLicenseModal: () => void;
  onOpenChangelogModal: () => void;
  remainingLicenseDays: number;
}

export function GoogleLoginScreen({
  onSuccess,
  onOpenLicenseModal,
  onOpenChangelogModal,
  remainingLicenseDays,
}: GoogleLoginScreenProps) {
  const clientId = getGoogleClientId();
  const [savedAccounts, setSavedAccounts] = useState<GoogleUserProfile[]>(() => getSavedGoogleAccounts());
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [isCheckingSession, setIsCheckingSession] = useState(() => Boolean(isSupabaseConfigured && supabase));
  const [isSigningIn, setIsSigningIn] = useState(false);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const handledSessionUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const errParam = url.searchParams.get("google_auth_error");
      if (errParam) {
        setAuthError(errParam);
        url.searchParams.delete("google_auth_error");
        window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
      }
      const fromUrl = consumeUrlGoogleAuthProfile();
      if (fromUrl) {
        onSuccessRef.current(fromUrl);
        return;
      }
    }
    if (isSupabaseConfigured && supabase) {
      let active = true;
      const syncSession = async (sbUser: import("@supabase/supabase-js").User | null | undefined) => {
        if (!active || !sbUser) {
          if (active) setIsCheckingSession(false);
          return;
        }
        if (handledSessionUserRef.current === sbUser.id) return;
        handledSessionUserRef.current = sbUser.id;
        const dbProfile = await fetchQodnProfile(sbUser.id);
        const mapped = mapSupabaseUserToProfile(sbUser, dbProfile);
        saveCurrentGoogleUser(mapped);
        if (!dbProfile) {
          void upsertQodnProfile(sbUser.id, mapped);
        }
        if (active) {
          setIsCheckingSession(false);
          onSuccessRef.current(mapped);
        }
      };
      void supabase.auth.getSession().then(({ data }) => {
        void syncSession(data.session?.user);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        if (event === "SIGNED_OUT") {
          handledSessionUserRef.current = null;
          setIsCheckingSession(false);
          return;
        }
        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) {
          void syncSession(session.user);
        }
      });
      return () => {
        active = false;
        sub.subscription.unsubscribe();
      };
    } else {
      setIsCheckingSession(false);
    }
  }, []);

  const handleTriggerGoogleSignIn = async () => {
    setAuthError("");
    setIsSigningIn(true);
    // 1. Supabase Auth (Google OAuth) when configured
    if (isSupabaseConfigured && supabase) {
      const { error } = await signInWithSupabaseGoogle();
      if (!error) {
        return;
      }
      setIsSigningIn(false);
      setAuthError(error || "Google Sign-In failed. Please try again.");
      return;
    }

    // 2. Check if server-side Kasbel Google OAuth redirect (/api/auth/google) is available
    try {
      const statusRes = await fetch("/api/auth/google?status=1");
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData?.configured) {
          window.location.href = "/api/auth/google";
          return;
        }
      }
    } catch {
      // Static web environment; use client-side GIS OAuth2 token client
    }

    // 3. Client-side Google Identity Services OAuth2 popup
    if (clientId && window.google?.accounts?.oauth2) {
      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "openid email profile",
          callback: async (tokenResponse) => {
            if (tokenResponse.error || !tokenResponse.access_token) {
              setAuthError(tokenResponse.error || "Google Sign-In was cancelled.");
              return;
            }
            try {
              const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
              });
              if (!res.ok) throw new Error("Failed to fetch Google user profile.");
              const data = await res.json();
              const profile: GoogleUserProfile = {
                sub: data.sub || `oauth-${Date.now()}`,
                email: data.email,
                name: data.name || data.email.split("@")[0],
                givenName: data.given_name,
                familyName: data.family_name,
                picture: data.picture,
                emailVerified: Boolean(data.email_verified),
                hd: data.hd,
                authMethod: "google_oauth",
                signedInAt: new Date().toISOString(),
              };
              saveCurrentGoogleUser(profile);
              onSuccess(profile);
            } catch (e: any) {
              setAuthError(e?.message || "Could not verify Google account.");
            }
          },
        });
        tokenClient.requestAccessToken({ prompt: "select_account" });
        return;
      } catch {
        // Fallback to interactive chooser modal
      }
    }
    setIsSigningIn(false);
    if (import.meta.env.DEV) {
      setShowGoogleModal(true);
    } else {
      setAuthError("Google Sign-In is required to access QuickODN Studio.");
    }
  };

  const handleCompleteInteractiveGoogleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setAuthError("Please enter a valid Google email address (e.g. name@gmail.com or Workspace email).");
      return;
    }
    const inferredName =
      nameInput.trim() ||
      cleanEmail
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
    const domain = cleanEmail.split("@")[1];
    const profile: GoogleUserProfile = {
      sub: `google-${cleanEmail}`,
      email: cleanEmail,
      name: inferredName,
      givenName: inferredName.split(" ")[0],
      familyName: inferredName.split(" ").slice(1).join(" "),
      emailVerified: true,
      hd: domain !== "gmail.com" && domain !== "googlemail.com" ? domain : undefined,
      authMethod: "google_account",
      signedInAt: new Date().toISOString(),
    };
    saveCurrentGoogleUser(profile);
    setShowGoogleModal(false);
    onSuccess(profile);
  };

  return (
    <div className="authScreen">
      <div className="authGridContainer">
        {/* Left Showcase Panel */}
        <div className="authHeroPanel">
          <div>
            <div className="authBrandRow">
              <div>
                <div className="authBrandTitle">
                  QuickODN Studio<i className="brandDot">.</i>
                </div>
                <div className="authBrandSubtitle">Enterprise FTTH &amp; QODN CAD Automation Suite</div>
              </div>
              <span className="authVersionPill">v1.0.0</span>
            </div>

            <h1 className="authHeroHeading">
              Precision GIS-to-AutoCAD drafting for modern fiber networks.
            </h1>
            <p className="authHeroLead">
              Transform Google Earth HLD designs and field pole surveys into production-ready AutoCAD drawings and engineering schedules in seconds.
            </p>

            <div className="authFeatureGrid">
              <div className="authFeatureCard">
                <div className="authFeatureIcon">
                  <Layers3 size={20} />
                </div>
                <div>
                  <strong>QODN Stencil Engine</strong>
                  <p>Automated mapping for X-Boxes, Hub Boxes, Sub/End Boxes, Closures, and Precon cables.</p>
                </div>
              </div>

              <div className="authFeatureCard">
                <div className="authFeatureIcon">
                  <Route size={20} />
                </div>
                <div>
                  <strong>Multi-Telco Pole &amp; Road LLD</strong>
                  <p>Full support for Globe ISDP, Maps.me, and PLDT/Smart standards with OSM carriageway curbs.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="authHeroFooter">
            <div className="authHeroMetaRow">
              <span>
                <ShieldCheck size={15} style={{ verticalAlign: "-3px", marginRight: "5px", color: "#38bdf8" }} />
                © 2026 <strong>Caesar Ian Samulde</strong> • All Rights Reserved
              </span>
              <span className="authLicenseBadge">
                {remainingLicenseDays} Days License Validity
              </span>
            </div>
            <div className="authHeroLinks">
              <button type="button" onClick={onOpenChangelogModal}>
                <Sparkles size={13} />
                Release Notes (v1.0.0)
              </button>
              <button type="button" onClick={onOpenLicenseModal}>
                EULA &amp; Fair Use Policy
              </button>
            </div>
          </div>
        </div>

        {/* Right Sign-In Card */}
        <div className="authLoginPanel">
          <div className="authLoginCard">
            <div className="authCardHeader">
              <div className="authGoogleBadgeCircle">
                <GoogleLogoSvg size={26} />
              </div>
              <h2>Sign in to your account</h2>
              <p>Authenticate with your Google Account to access the QuickODN CAD workspace and sync your conversion history.</p>
            </div>

            {authError && (
              <div className="authAlertError">
                <span>{authError}</span>
                <button type="button" onClick={() => setAuthError("")} aria-label="Dismiss error">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Single Primary Sign in with Google Button */}
            {isCheckingSession ? (
              <div className="qodnAuthLoadingBox">
                <div className="qodnSpinner lg" />
                <strong>Verifying Google session...</strong>
                <span>Checking your QuickODN Studio workspace credentials.</span>
              </div>
            ) : (
            <>
            <button
              type="button"
              className="googleSignInBtn"
              disabled={isSigningIn}
              onClick={handleTriggerGoogleSignIn}
            >
              {isSigningIn ? <Loader2 size={18} className="qodnSpinIcon" /> : <GoogleLogoSvg size={20} />}
              <span>{isSigningIn ? "Redirecting to Google..." : "Continue with Google"}</span>
            </button>

            {/* Saved Google Accounts on this Workstation */}
            {savedAccounts.length > 0 && (
              <div className="savedAccountsSection">
                <div className="savedAccountsLabel">Recent Google Accounts on this device</div>
                <div className="savedAccountsList">
                  {savedAccounts.map((acc) => (
                    <div key={acc.email} className="savedAccountRow">
                      <button
                        type="button"
                        className="savedAccountSelectBtn"
                        disabled={isSigningIn}
                        onClick={async () => {
                          if (isSupabaseConfigured && supabase) {
                            setIsSigningIn(true);
                            const { error } = await signInWithSupabaseGoogle(acc.email);
                            if (!error) return;
                            setIsSigningIn(false);
                            setAuthError(error);
                            return;
                          }
                          const refreshed: GoogleUserProfile = {
                            ...acc,
                            signedInAt: new Date().toISOString(),
                          };
                          saveCurrentGoogleUser(refreshed);
                          onSuccess(refreshed);
                        }}
                      >
                        <UserAvatar user={acc} size={34} />
                        <div className="savedAccountMeta">
                          <strong>{acc.name}</strong>
                          <span>{acc.email}</span>
                        </div>
                        <span className="savedAccountArrow">Sign in →</span>
                      </button>
                      <button
                        type="button"
                        className="savedAccountRemoveBtn"
                        title="Remove saved account from list"
                        onClick={() => setSavedAccounts(removeSavedGoogleAccount(acc.email))}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>
            )}

            <div className="authSecurityNote">
              <ShieldCheck size={16} color="#0284c7" style={{ flexShrink: 0, marginTop: "1px" }} />
              <span>
                Your Google identity is verified for workspace personalization, CAD export attribution, and workstation license auditing.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Google Account Sign-In Modal */}
      {showGoogleModal && (
        <div className="modalOverlay" onClick={() => setShowGoogleModal(false)}>
          <div
            className="googleChooserModal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="googleChooserHeader">
              <GoogleLogoSvg size={20} />
              <span>Sign in with Google</span>
              <button
                type="button"
                className="modalCloseButton"
                style={{ marginLeft: "auto" }}
                onClick={() => setShowGoogleModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="googleChooserBody">
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: "0 0 4px", fontSize: "1.25rem", fontWeight: 700, color: "#0f172a" }}>
                  Continue to QuickODN Studio<i className="brandDot">.</i>
                </h3>
                <p style={{ margin: 0, fontSize: "0.86rem", color: "#64748b" }}>
                  Enter your Google Account details to start your engineering session
                </p>
              </div>

              <form onSubmit={handleCompleteInteractiveGoogleSignIn} className="googleChooserForm">
                <label>
                  <span>Google Email or Workspace Address *</span>
                  <div className="inputWithIcon">
                    <Mail size={16} color="#64748b" />
                    <input
                      type="email"
                      required
                      autoFocus
                      placeholder="engineer@gmail.com or user@globe.com.ph"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                    />
                  </div>
                </label>

                <label>
                  <span>Display Name (Full Name)</span>
                  <div className="inputWithIcon">
                    <UserCheck size={16} color="#64748b" />
                    <input
                      type="text"
                      placeholder="e.g. Caesar Ian Samulde"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                    />
                  </div>
                </label>

                <div className="googleChooserActions">
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => setShowGoogleModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="primaryButton">
                    <GoogleLogoSvg size={16} />
                    <span>Sign In with Google</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="googleChooserFooter">
              <span>Google Identity Services • QuickODN Studio Session</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface UserOnboardingScreenProps {
  user: GoogleUserProfile;
  onComplete: (updatedUser: GoogleUserProfile) => void;
  onSignOut: () => void;
}

export function UserOnboardingScreen({
  user,
  onComplete,
  onSignOut,
}: UserOnboardingScreenProps) {
  const defaultFirst =
    user.firstName ||
    user.givenName ||
    (user.name && user.name.includes(" ") ? user.name.split(" ")[0] : "") ||
    "";
  const defaultLast =
    user.lastName ||
    user.familyName ||
    (user.name && user.name.includes(" ") ? user.name.split(" ").slice(1).join(" ") : "") ||
    "";

  const [firstName, setFirstName] = useState(defaultFirst);
  const [lastName, setLastName] = useState(defaultLast);
  const [companyName, setCompanyName] = useState(user.companyName || "");
  const [formError, setFormError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !companyName.trim()) {
      setFormError("Please enter your First Name, Last Name, and Company Name to continue.");
      return;
    }
    const updated = saveUserOnboardingProfile(user, {
      firstName,
      lastName,
      companyName,
    });
    onComplete(updated);
  };

  return (
    <div className="authScreen">
      <div
        className="googleChooserModal"
        style={{
          maxWidth: "480px",
          width: "100%",
          borderRadius: "20px",
          boxShadow: "0 32px 80px rgba(0, 0, 0, 0.55)",
        }}
      >
        <div
          className="googleChooserHeader"
          style={{
            background: "linear-gradient(135deg, #0b1120 0%, #1e293b 100%)",
            color: "#f8fafc",
            borderBottom: "1px solid #334155",
            padding: "18px 24px",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontFamily: "var(--font-brand)", fontSize: "1.06rem", fontWeight: 700, letterSpacing: "-0.03em" }}>
              QuickODN Studio<i className="brandDot">.</i>
            </span>
            <span className="authVersionPill" style={{ marginLeft: "4px" }}>
              Account Setup
            </span>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.16)",
              color: "#cbd5e1",
              borderRadius: "8px",
              padding: "5px 10px",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <LogOut size={13} />
            <span>Switch Account</span>
          </button>
        </div>

        <div className="googleChooserBody" style={{ padding: "26px 28px 24px" }}>
          {/* Authenticated Google Identity Summary */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 14px",
              borderRadius: "12px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              marginBottom: "20px",
            }}
          >
            <UserAvatar user={user} size={42} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <strong style={{ fontSize: "0.88rem", color: "#0f172a" }}>{user.email}</strong>
              </div>
              <span style={{ fontSize: "0.76rem", color: "#64748b", display: "inline-flex", alignItems: "center", gap: "5px", marginTop: "2px" }}>
                <GoogleLogoSvg size={12} />
                Google Account Verified • First-Time Profile Setup
              </span>
            </div>
          </div>

          <h2 style={{ margin: "0 0 6px", fontSize: "1.3rem", fontWeight: 700, color: "#0f172a", letterSpacing: "-0.025em" }}>
            Complete your user profile
          </h2>
          <p style={{ margin: "0 0 18px", fontSize: "0.85rem", color: "#64748b", lineHeight: 1.5 }}>
            Please provide your full name and company affiliation to personalize your CAD workspace and engineering exports.
          </p>

          {formError && (
            <div className="authAlertError" style={{ marginBottom: "14px" }}>
              <span>{formError}</span>
              <button type="button" onClick={() => setFormError("")}>
                <X size={14} />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="googleChooserForm">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <label>
                <span>First Name *</span>
                <div className="inputWithIcon">
                  <UserCheck size={15} color="#64748b" />
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Caesar Ian"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
              </label>

              <label>
                <span>Last Name *</span>
                <div className="inputWithIcon">
                  <UserCheck size={15} color="#64748b" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Samulde"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </label>
            </div>

            <label>
              <span>Company / Organization Name *</span>
              <div className="inputWithIcon">
                <Building2 size={15} color="#64748b" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Kasbel / Globe Telecom / Engineering Partner"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
            </label>

            <button
              type="submit"
              className="primaryCta"
              style={{ marginTop: "8px", minHeight: "46px", fontSize: "0.92rem" }}
            >
              <CheckCircle2 size={17} />
              <span>Save Profile &amp; Enter Workspace</span>
            </button>
          </form>
        </div>

        <div className="googleChooserFooter">
          <span>Your profile details are bound to {user.email} for CAD export attribution.</span>
        </div>
      </div>
    </div>
  );
}

interface UserActivityHistoryViewProps {
  user: GoogleUserProfile;
  activities: UserActivityItem[];
  isLoadingHistory?: boolean;
  supabaseConnected?: boolean;
  onClearHistory: () => void;
  onNavigateMode: (mode: "hld_nap" | "pole_survey" | "excel_pic") => void;
  onUpdateUser?: (updated: GoogleUserProfile) => void;
}

export function UserActivityHistoryView({
  user,
  activities,
  isLoadingHistory = false,
  supabaseConnected = false,
  onClearHistory,
  onNavigateMode,
}: UserActivityHistoryViewProps) {
  const [filterEvent, setFilterEvent] = useState<"all" | "convert" | "export" | "roads">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredActivities = activities.filter((item) => {
    if (filterEvent === "convert" && item.event !== "KMZ_CONVERT" && item.event !== "EXCEL_PIC_CONVERT") return false;
    if (filterEvent === "export" && !item.event.startsWith("EXPORT_")) return false;
    if (filterEvent === "roads" && item.event !== "OSM_ROADS_FETCH") return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.fileName.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.event.toLowerCase().includes(q) ||
        (item.provider || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalConversions = activities.filter((a) => a.event === "KMZ_CONVERT" || a.event === "EXCEL_PIC_CONVERT").length;
  const totalExports = activities.filter((a) => a.event.startsWith("EXPORT_")).length;

  return (
    <div className="accountWorkspace">
      {/* Signed-In Google Account Hero Banner */}
      <div className="accountProfileBanner">
        <div className="accountProfileLeft">
          <UserAvatar user={user} size={60} />
          <div>
            <div className="accountNameRow">
              <h2>{user.name}</h2>
              {user.companyName && (
                <span className="workspaceDomainPill" style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                  <Building2 size={12} />
                  {user.companyName}
                </span>
              )}
              <span className="googleVerifiedPill">
                <GoogleLogoSvg size={13} />
                Google Verified
              </span>
            </div>
            <div className="accountEmailText">{user.email}</div>
            <div className="accountSessionMeta">
              <Clock size={13} />
              <span>Signed in {new Date(user.signedInAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="accountStatsRow">
          <div className="accountStatBox">
            <span>Conversions</span>
            <strong>{totalConversions}</strong>
          </div>
          <div className="accountStatBox">
            <span>CAD Exports</span>
            <strong>{totalExports}</strong>
          </div>
        </div>
      </div>

      {/* Account Details Card */}
      <div className="panel" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
          <strong style={{ fontSize: "13.5px", color: "#0f172a" }}>Account Details</strong>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", fontSize: "12.5px" }}>
          <div>
            <div style={{ color: "#64748b", fontSize: "11.5px" }}>Full Name</div>
            <strong style={{ color: "#0f172a" }}>{user.name}</strong>
          </div>
          <div>
            <div style={{ color: "#64748b", fontSize: "11.5px" }}>Company / Organization</div>
            <strong style={{ color: "#0f172a" }}>{user.companyName || "Not set"}</strong>
          </div>
          <div>
            <div style={{ color: "#64748b", fontSize: "11.5px" }}>Email Address</div>
            <strong style={{ color: "#0f172a" }}>{user.email}</strong>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="panel" style={{ padding: "18px 20px" }}>
        <div className="activityToolbar">
          <div className="activityFilterPills">
            <button
              type="button"
              className={`activityFilterBtn ${filterEvent === "all" ? "active" : ""}`}
              onClick={() => setFilterEvent("all")}
            >
              All History ({activities.length})
            </button>
            <button
              type="button"
              className={`activityFilterBtn ${filterEvent === "convert" ? "active" : ""}`}
              onClick={() => setFilterEvent("convert")}
            >
              Conversions ({totalConversions})
            </button>
            <button
              type="button"
              className={`activityFilterBtn ${filterEvent === "export" ? "active" : ""}`}
              onClick={() => setFilterEvent("export")}
            >
              CAD Exports ({totalExports})
            </button>
          </div>

          <div className="activityRightControls">
            <div className="activitySearchBox">
              <Search size={15} color="#64748b" />
              <input
                type="text"
                placeholder="Search file name or event..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {activities.length > 0 && (
              <button
                type="button"
                className="secondaryButton"
                style={{ color: "#dc2626", padding: "7px 12px", fontSize: "12.5px" }}
                onClick={onClearHistory}
              >
                <Trash2 size={14} />
                <span>Clear History</span>
              </button>
            )}
          </div>
        </div>

        {isLoadingHistory && activities.length === 0 ? (
          <div className="qodnSkeletonList" aria-label="Loading conversion history">
            <div className="qodnSkeletonRow" />
            <div className="qodnSkeletonRow" />
            <div className="qodnSkeletonRow" />
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="activityEmptyState">
            <div className="activityEmptyIcon">
              <History size={28} />
            </div>
            <h3>No conversion activity found</h3>
            <p>
              Files you convert or export while signed in as <strong>{user.email}</strong> will automatically appear in your personal engineering timeline.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "14px", flexWrap: "wrap" }}>
              <button type="button" className="primaryButton" onClick={() => onNavigateMode("pole_survey")}>
                <Route size={16} />
                <span>Open QODN Converter</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="activityList">
            {filteredActivities.map((item) => {
              const isExport = item.event.startsWith("EXPORT_");
              const modeLabel =
                item.mode === "pole_survey"
                  ? "QODN Converter"
                  : item.mode === "hld_nap"
                    ? "QODN HLD"
                    : item.mode;

              return (
                <div key={item.id} className="activityRowCard">
                  <div className={`activityEventIcon ${isExport ? "export" : "convert"}`}>
                    {isExport ? <Download size={18} /> : <FileArchive size={18} />}
                  </div>
                  <div className="activityRowMain">
                    <div className="activityRowTop">
                      <strong>{item.fileName || "Project File"}</strong>
                      <span className={`activityEventBadge ${isExport ? "export" : "convert"}`}>
                        {item.event.replace(/_/g, " ")}
                      </span>
                      <span className="activityModeBadge">{modeLabel}</span>
                      {item.provider && (
                        <span className="activityProviderBadge">{item.provider.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="activityRowSummary">{item.summary}</div>
                  </div>
                  <div className="activityRowRight">
                    <div className="activityCountPill">{item.itemCount.toLocaleString()} items</div>
                    <time>{new Date(item.timestamp).toLocaleString()}</time>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
