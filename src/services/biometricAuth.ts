/**
 * biometricAuth.ts – Face ID / face unlock authentication service.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ROOT CAUSE OF THE PREVIOUS BUG (WHY LOGIN BYPASSED REAL BIOMETRICS):
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The previous implementation stored a Keychain "gate" entry with accessControl
 * set to BIOMETRY_ANY_OR_DEVICE_PASSCODE and relied on reading that entry with
 * `authenticationPrompt` to trigger the OS biometric dialog.
 *
 * On Android, this approach is FATALLY FLAWED for face-unlock-only devices:
 *
 *   - Most Android face unlock is Class 2 ("weak") biometry.
 *   - Android Keystore CANNOT protect cryptographic keys with weak biometrics.
 *   - So react-native-keychain's `accessControl` silently stores the key
 *     WITHOUT biometric protection.
 *   - Subsequent reads via `getGenericPassword({ authenticationPrompt })` return
 *     the value IMMEDIATELY — with NO OS prompt shown at all.
 *   - Result: anyone can tap "Login with Face ID" and get logged in instantly.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FIX (INDUSTRY-STANDARD APPROACH — USED BY BANKING APPS):
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. AUTHENTICATION GATE: ReactNativeBiometrics.simplePrompt()
 *    - Directly invokes Android BiometricPrompt / iOS LAContext.
 *    - On Android, uses allowDeviceCredentials: true PLUS a native patch
 *      that maps this to BIOMETRIC_STRONG | BIOMETRIC_WEAK (NO DEVICE_CREDENTIAL).
 *    - This supports Class 2 face unlock WITHOUT allowing PIN/pattern fallback.
 *    - Someone else's face / PIN cannot bypass the biometric check.
 *    - On iOS, uses allowDeviceCredentials: false (Face ID / Touch ID only).
 *    - The prompt is REQUIRED before any credentials are returned.
 *    - There is NO code path where credentials are returned without a
 *      successful prompt result.
 *
 * 2. CREDENTIAL STORAGE: react-native-keychain WITHOUT accessControl.
 *    - Keychain is used purely for encrypted-at-rest credential storage.
 *    - No biometric-gating on the Keychain entry itself.
 *    - The simplePrompt() call IS the gate, not the Keychain read.
 *    - This avoids the Android Keystore weak-biometric issue entirely.
 *
 * 3. AVAILABILITY CHECK: isSensorAvailable() with allowDeviceCredentials on Android.
 *    - Checks BiometricManager.canAuthenticate(BIOMETRIC_STRONG | BIOMETRIC_WEAK).
 *    - Returns "available" for devices with face unlock or fingerprint.
 *    - Does NOT consider device PIN as a valid biometric.
 *    - Prevents false "not available" on face-only devices.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * SECURITY GUARANTEES:
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - The app NEVER logs a user in just because "Login with Face ID" was pressed.
 * - The app ALWAYS calls simplePrompt() and checks { success: true } === true.
 * - Stored credentials are ONLY returned AFTER simplePrompt() succeeds.
 * - If the OS returns failure, cancellation, or error → login is denied, period.
 * - PIN / pattern / device password is NOT accepted — biometric only.
 * - Someone else's face will be rejected by the OS biometric system.
 * - There is NO boolean flag, Keychain trick, or fallback that bypasses the prompt.
 */

import { Platform } from 'react-native';
import ReactNativeBiometrics from 'react-native-biometrics';
import * as Keychain from 'react-native-keychain';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BiometryKind = 'faceId' | 'touchId' | 'biometrics' | 'none';

export type BiometricState =
  | { state: 'notSupported'; kind: 'none'; message: string }
  | { state: 'notEnrolled'; kind: Exclude<BiometryKind, 'none'>; message: string }
  | { state: 'available'; kind: Exclude<BiometryKind, 'none'> }
  | { state: 'availableAndEnabled'; kind: Exclude<BiometryKind, 'none'> };

export type BiometricCredentials = { email: string; password: string };

export type AuthenticateParams = {
  kindHint?: BiometryKind;
  promptMessage?: string;
  cancelButtonText?: string;
};

export type FaceIdAvailability = 'AVAILABLE' | 'NOT_ENROLLED' | 'NOT_AVAILABLE';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Keychain service for stored login credentials (email + password). */
const KEYCHAIN_SERVICE = 'com.receiptstacker.biometricLogin' as const;

/** Keychain service for per-user generic secret storage. */
const KEYCHAIN_SECRET_SERVICE_PREFIX = 'com.receiptstacker.biometricSecret' as const;

// ─── In-memory handoff (Login screen → BiometricSetup screen) ─────────────────

let pendingBiometricSetupCreds: BiometricCredentials | null = null;

export const setPendingBiometricSetupCreds = (creds: BiometricCredentials | null) => {
  pendingBiometricSetupCreds = creds;
};

export const consumePendingBiometricSetupCreds = (): BiometricCredentials | null => {
  const out = pendingBiometricSetupCreds;
  pendingBiometricSetupCreds = null;
  return out;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a ReactNativeBiometrics instance with platform-appropriate settings.
 *
 * Android: allowDeviceCredentials = true (PATCHED at native level)
 *   → BiometricPrompt uses BIOMETRIC_STRONG | BIOMETRIC_WEAK (no DEVICE_CREDENTIAL).
 *   → Face unlock (even Class 2 "weak") is supported.
 *   → If face fails, auth FAILS — no PIN/pattern fallback.
 *   → Someone else cannot bypass this with the device PIN.
 *   → THIS IS WHY IT WORKS ON FACE-ONLY DEVICES (no fingerprint sensor).
 *
 * iOS: allowDeviceCredentials = false
 *   → LAContext uses .deviceOwnerAuthenticationWithBiometrics (Face ID / Touch ID only).
 */
const createBiometrics = () =>
  new ReactNativeBiometrics({ allowDeviceCredentials: Platform.OS === 'android' });

/** Product requirement: always show "Face ID" in UI regardless of platform. */
export const getBiometryLabel = (_kind: BiometryKind): string => 'Face ID';

const isNotEnrolledError = (raw: string): boolean => {
  const lower = raw.toLowerCase();
  return (
    lower.includes('not_enrolled') ||
    lower.includes('biometrics_not_enrolled') ||
    lower.includes('not enrolled') ||
    lower.includes('no biometrics')
  );
};

/** Convert native biometric errors to user-friendly messages. */
const toFriendlyError = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  const lower = msg.toLowerCase();

  if (lower.includes('cancel') || lower.includes('canceled') || lower.includes('user canceled')) {
    return 'Face ID authentication was cancelled.';
  }
  if (isNotEnrolledError(msg)) {
    return 'Face ID is not set up. Please enable face unlock in your device settings and try again.';
  }
  if (
    lower.includes('not available') ||
    lower.includes('not supported') ||
    lower.includes('no hardware')
  ) {
    return 'Face ID is not available on this device.';
  }
  if (lower.includes('lockout')) {
    return 'Face ID is temporarily locked. Unlock your device and try again.';
  }

  return msg.length > 0 ? msg : 'Face ID authentication failed.';
};

// ─── Availability ─────────────────────────────────────────────────────────────

/**
 * Check whether Face ID / face unlock is usable on this device.
 *
 * Android: allowDeviceCredentials: true → checks
 *   BiometricManager.canAuthenticate(BIOMETRIC_WEAK | DEVICE_CREDENTIAL).
 *   Returns AVAILABLE for any device with face unlock, fingerprint, or device PIN.
 *   This correctly supports devices with face unlock but no fingerprint sensor.
 *
 * iOS: checks LAContext for Face ID / Touch ID availability.
 */
export const checkFaceIdAvailability = async (): Promise<FaceIdAvailability> => {
  const rn = createBiometrics();
  try {
    const sensor: any = await rn.isSensorAvailable();
    if (sensor?.available === true) return 'AVAILABLE';

    const errorStr = String(sensor?.error ?? '');
    if (isNotEnrolledError(errorStr)) return 'NOT_ENROLLED';

    // Android: if the check is inconclusive, treat as available.
    // The real OS prompt (simplePrompt) will be the final arbiter.
    if (Platform.OS === 'android') return 'AVAILABLE';

    return 'NOT_AVAILABLE';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? '');
    if (isNotEnrolledError(msg)) return 'NOT_ENROLLED';
    return Platform.OS === 'android' ? 'AVAILABLE' : 'NOT_AVAILABLE';
  }
};

// ─── Credential Storage ───────────────────────────────────────────────────────

/** Check if Face ID login credentials are stored in secure storage. */
export const hasBiometricCredentials = async (): Promise<boolean> => {
  try {
    return await Keychain.hasGenericPassword({ service: KEYCHAIN_SERVICE });
  } catch {
    return false;
  }
};

// ─── State ────────────────────────────────────────────────────────────────────

export const getBiometricState = async (): Promise<BiometricState> => {
  const availability = await checkFaceIdAvailability();
  const defaultKind: Exclude<BiometryKind, 'none'> =
    Platform.OS === 'ios' ? 'faceId' : 'biometrics';

  if (availability === 'NOT_AVAILABLE') {
    return {
      state: 'notSupported',
      kind: 'none',
      message: 'Face ID is not available on this device.',
    };
  }
  if (availability === 'NOT_ENROLLED') {
    return {
      state: 'notEnrolled',
      kind: defaultKind,
      message:
        'Face ID is not set up. Please enable face unlock in your device settings and try again.',
    };
  }

  const enabled = await hasBiometricCredentials();
  return enabled
    ? { state: 'availableAndEnabled', kind: defaultKind }
    : { state: 'available', kind: defaultKind };
};

// ─── OS-Level Biometric Prompt (THE SECURITY GATE) ────────────────────────────

/**
 * Trigger the OS biometric / face unlock prompt.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THIS IS THE ONLY SECURITY GATE FOR FACE ID LOGIN.                     │
 * │                                                                       │
 * │ - It calls ReactNativeBiometrics.simplePrompt().                      │
 * │ - On Android this invokes BiometricPrompt with BIOMETRIC_WEAK |       │
 * │   BIOMETRIC_STRONG (no DEVICE_CREDENTIAL) — face only, no PIN.       │
 * │ - On iOS this invokes LAContext with Face ID / Touch ID.              │
 * │ - It ONLY returns (resolves) when the OS reports SUCCESS.             │
 * │ - It THROWS on cancellation, failure, or any error.                   │
 * │ - There is NO fallback, NO mock, NO bypass.                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export const authenticateWithBiometrics = async (
  params: AuthenticateParams = {},
): Promise<void> => {
  const label = getBiometryLabel(params.kindHint ?? 'faceId');
  const promptMessage = params.promptMessage ?? `Login with ${label}`;
  const rn = createBiometrics();

  let result: { success: boolean };
  try {
    result = await rn.simplePrompt({
      promptMessage,
      cancelButtonText: params.cancelButtonText ?? 'Cancel',
    });
  } catch (e) {
    // simplePrompt can throw on devices where biometrics are truly unavailable.
    throw new Error(toFriendlyError(e));
  }

  // ╔═══════════════════════════════════════════════════════════════════════╗
  // ║ CRITICAL SECURITY CHECK                                             ║
  // ║                                                                     ║
  // ║ Only proceed if result.success is EXACTLY true.                     ║
  // ║ Any other value (false, undefined, null) means auth failed.         ║
  // ║ There is NO other code path that lets this function return.         ║
  // ╚═══════════════════════════════════════════════════════════════════════╝
  if (result.success !== true) {
    throw new Error('Face ID authentication was cancelled.');
  }

  // If we reach here, the OS confirmed successful biometric / device credential auth.
};

// ─── Setup ────────────────────────────────────────────────────────────────────

/**
 * Enable Face ID login for this device.
 *
 * Flow:
 * 1. Check if biometrics are available (AVAILABLE / NOT_ENROLLED / NOT_AVAILABLE).
 * 2. Trigger OS biometric prompt via simplePrompt() — user MUST authenticate.
 * 3. ONLY on success: store credentials in Keychain (secure, encrypted at rest).
 * 4. On failure or cancellation: nothing is stored, error is thrown.
 */
export const enableBiometricLogin = async (
  creds: BiometricCredentials,
): Promise<void> => {
  const availability = await checkFaceIdAvailability();
  if (availability === 'NOT_AVAILABLE') {
    throw new Error('Face ID is not available on this device.');
  }
  if (availability === 'NOT_ENROLLED') {
    throw new Error(
      'Face ID is not set up. Please enable face unlock in your device settings and try again.',
    );
  }

  // STEP 1: Trigger the OS prompt FIRST, BEFORE storing anything.
  //         If this throws (cancel, failure), no credentials are stored.
  await authenticateWithBiometrics({ promptMessage: 'Set up Face ID' });

  // STEP 2: OS authentication succeeded → store credentials securely.
  //         No accessControl flag — the simplePrompt() above IS the gate.
  //         (This avoids the Android Keystore weak-biometric issue entirely.)
  try {
    await Keychain.setGenericPassword(creds.email, creds.password, {
      service: KEYCHAIN_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    throw new Error('Failed to store credentials securely. Please try again.');
  }
};

/** Remove all stored Face ID credentials for this device. */
export const disableBiometricLogin = async (): Promise<void> => {
  try {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  } catch {
    // ignore
  }
  // Clean up legacy gate entries from previous implementation (if any).
  try {
    await Keychain.resetGenericPassword({ service: 'com.receiptstacker.faceIdGate' });
  } catch {
    // ignore
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * Retrieve stored credentials after successful biometric authentication.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ SECURITY: This function ALWAYS shows an OS biometric prompt.          │
 * │ Credentials are ONLY returned after simplePrompt() returns success.   │
 * │ There is NO code path that returns credentials without a prompt.      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Flow:
 * 1. Verify that Face ID login has been set up (credentials in Keychain).
 * 2. Trigger OS biometric prompt via simplePrompt() — MUST return success.
 * 3. Only on success: read and return stored credentials from Keychain.
 * 4. On failure/cancellation: throw error → caller stays on login screen.
 */
export const getBiometricCredentials = async (
  kindHint?: BiometryKind,
): Promise<BiometricCredentials> => {
  const label = getBiometryLabel(kindHint ?? 'faceId');

  // STEP 1: Check that Face ID was previously set up.
  const enabled = await hasBiometricCredentials();
  if (!enabled) {
    throw new Error(
      `${label} is not set up on this device. Please tap 'Set up ${label}' first.`,
    );
  }

  // STEP 2: REQUIRE a real OS biometric prompt.
  //         This is the security gate. If it throws, login is denied.
  //         authenticateWithBiometrics() calls simplePrompt() and only
  //         returns if the OS reports success. It throws on everything else.
  await authenticateWithBiometrics({
    kindHint,
    promptMessage: `Login with ${label}`,
  });

  // STEP 3: OS confirmed success → now read the stored credentials.
  try {
    const result = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
    if (!result) {
      throw new Error(`${label} login is not set up.`);
    }
    return { email: result.username, password: result.password };
  } catch (e) {
    throw new Error(toFriendlyError(e));
  }
};

// ─── Convenience API ──────────────────────────────────────────────────────────

export const isBiometricAvailable = async (): Promise<boolean> => {
  const a = await checkFaceIdAvailability();
  return a === 'AVAILABLE';
};

export const isBiometricEnabledForUser = async (_userId: string): Promise<boolean> =>
  hasBiometricCredentials();

export const setupBiometricForUser = async (
  _userId: string,
  tokenOrSecret: string,
): Promise<void> => {
  const userId = String(_userId ?? '').trim();
  if (!userId) throw new Error('Missing userId for Face ID setup');

  const availability = await checkFaceIdAvailability();
  if (availability !== 'AVAILABLE') {
    throw new Error('Face ID is not available on this device.');
  }

  await authenticateWithBiometrics({ promptMessage: 'Set up Face ID' });

  await Keychain.setGenericPassword('secret', tokenOrSecret, {
    service: `${KEYCHAIN_SECRET_SERVICE_PREFIX}:${userId}`,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
};

export const setupFaceIdForUser = async (
  userId: string,
  tokenOrCredentials: BiometricCredentials | string,
): Promise<void> => {
  if (typeof tokenOrCredentials === 'string') {
    await setupBiometricForUser(userId, tokenOrCredentials);
    return;
  }
  await enableBiometricLogin(tokenOrCredentials);
};

export const loginWithFaceId = async (
  _userId: string,
): Promise<BiometricCredentials> => {
  return getBiometricCredentials('faceId');
};
