import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file',
];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

function createGoogleProvider(forceConsent = false): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({
    prompt: forceConsent ? 'consent select_account' : 'select_account',
  });
  return provider;
}

let isSigningIn = false;
// Strictly in-memory OAuth access token cache (never persisted to localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

export function initGoogleAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthNeedsSignIn?: (user: User | null) => void,
) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthNeedsSignIn?.(user);
      }
    } else {
      cachedAccessToken = null;
      onAuthNeedsSignIn?.(null);
    }
  });
}

export async function googleSignIn(options?: {
  forceConsent?: boolean;
}): Promise<{ user: User; accessToken: string }> {
  try {
    isSigningIn = true;
    const provider = createGoogleProvider(Boolean(options?.forceConsent));
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Could not obtain Google Drive access token.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        `This domain (${window.location.hostname}) is not authorized yet. Add it in Firebase Console → Authentication → Settings → Authorized domains.`,
      );
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('Sign-in popup was blocked by your browser. Please allow popups and try again.');
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Google sign-in popup was closed before finishing. Try again when ready.');
    }
    if (code === 'auth/network-request-failed') {
      throw new Error('Network error while contacting Google. Check your internet connection and try again.');
    }
    throw err;
  } finally {
    isSigningIn = false;
  }
}

export function getGoogleAccessToken(): string | null {
  return cachedAccessToken;
}

export function clearGoogleAccessToken() {
  cachedAccessToken = null;
}

export async function googleLogout(): Promise<void> {
  await auth.signOut();
  cachedAccessToken = null;
}
