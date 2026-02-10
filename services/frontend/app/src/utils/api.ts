const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const envBase = typeof import.meta !== "undefined" ? import.meta.env?.VITE_API_URL : undefined;
const browserOrigin = typeof window !== "undefined" ? window.location.origin : undefined;
const defaultBase = "http://localhost:8000";
const frontendDevPorts = ["3000", "5173", "4173"];

const rawBaseUrl =
  envBase ||
  // When running the Vite dev server without VITE_API_URL, point to Django on 8000.
  (browserOrigin && frontendDevPorts.some((port) => browserOrigin.endsWith(`:${port}`)) ? defaultBase : browserOrigin) ||
  defaultBase;

const normalisedBase = stripTrailingSlash(rawBaseUrl);

export const apiBaseUrl = normalisedBase.endsWith("/api")
  ? normalisedBase
  : `${normalisedBase}/api`;

export const authTokenKey = "authToken";
export const authUserKey = "authUser";

const safeSessionStorage = (() => {
  if (typeof window === "undefined") return null;
  try {
    const store = window.sessionStorage;
    const probe = "__storage_probe__";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch (_err) {
    return null;
  }
})();

const safeLocalStorage = (() => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (_err) {
    return null;
  }
})();

const primaryStorage = safeSessionStorage || safeLocalStorage;

const migrateLegacyStorage = () => {
  if (!primaryStorage || !safeLocalStorage || primaryStorage === safeLocalStorage) return;
  const token = safeLocalStorage.getItem(authTokenKey);
  const user = safeLocalStorage.getItem(authUserKey);
  if (token && !primaryStorage.getItem(authTokenKey)) {
    primaryStorage.setItem(authTokenKey, token);
  }
  if (user && !primaryStorage.getItem(authUserKey)) {
    primaryStorage.setItem(authUserKey, user);
  }
  safeLocalStorage.removeItem(authTokenKey);
  safeLocalStorage.removeItem(authUserKey);
};

migrateLegacyStorage();

let inMemoryAuthToken: string | null = null;

const readItem = (key: string): string | null => {
  if (key === authTokenKey && inMemoryAuthToken) {
    return inMemoryAuthToken;
  }
  if (primaryStorage) {
    const value = primaryStorage.getItem(key);
    if (value !== null) return value;
  }
  if (safeLocalStorage && safeLocalStorage !== primaryStorage) {
    return safeLocalStorage.getItem(key);
  }
  return null;
};

const writeItem = (key: string, value: string) => {
  if (key === authTokenKey) {
    inMemoryAuthToken = value;
  }
  if (primaryStorage) {
    primaryStorage.setItem(key, value);
  } else if (safeLocalStorage) {
    safeLocalStorage.setItem(key, value);
  }
};

const removeItem = (key: string) => {
  if (key === authTokenKey) {
    inMemoryAuthToken = null;
  }
  if (primaryStorage) {
    primaryStorage.removeItem(key);
  }
  if (safeLocalStorage && safeLocalStorage !== primaryStorage) {
    safeLocalStorage.removeItem(key);
  }
};

export const getAuthToken = (): string | null => readItem(authTokenKey);

export type AuthUser = {
  id?: number;
  email?: string;
  username?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_senior_admin?: boolean;
  is_senior_invigilator?: boolean;
  role?: string;
  invigilator_id?: number | null;
  phone?: string;
  avatar?: string;
};

const parseStoredUser = (): AuthUser | null => {
  const raw = readItem(authUserKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch (_err) {
    return null;
  }
};

export const getStoredUser = (): AuthUser | null => parseStoredUser();
export const getStoredRole = (): string | null => {
  const user = parseStoredUser();
  if (!user) return null;
  if (user.role) return user.role;
  if (user.is_staff || user.is_superuser) return "admin";
  return "invigilator";
};

const normalizeHeaders = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
};

const withAuthHeader = (headers?: HeadersInit): HeadersInit => {
  const base = normalizeHeaders(headers);
  const token = getAuthToken();
  if (token) {
    base.Authorization = `Token ${token}`;
  }
  return base;
};

export const apiFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = withAuthHeader(init.headers);
  return fetch(input, { ...init, headers });
};

// Convenience helper for unauthenticated public reads when auth is not set.
export const apiFetchPublic = (input: RequestInfo | URL, init: RequestInit = {}) =>
  fetch(input, { ...init, headers: normalizeHeaders(init.headers) });

export const setAuthSession = (token: string, user?: AuthUser) => {
  writeItem(authTokenKey, token);
  if (user) {
    writeItem(authUserKey, JSON.stringify(user));
  }
};

export const clearAuthSession = () => {
  removeItem(authTokenKey);
  removeItem(authUserKey);
};
