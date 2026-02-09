import { Alert, type AlertButton, type AlertOptions } from 'react-native';

const nativeAlertAlert = Alert.alert.bind(Alert);

let didInstallMonkeyPatch = false;

export type ThemedAlertPayload = {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: AlertOptions;
};

type AlertHandler = (payload: ThemedAlertPayload) => void;

let handler: AlertHandler | null = null;

/**
 * Register the alert handler used by the in-app themed alert host.
 *
 * Returns an unregister function.
 */
export const registerThemedAlertHandler = (nextHandler: AlertHandler) => {
  handler = nextHandler;
  return () => {
    if (handler === nextHandler) handler = null;
  };
};

/**
 * App-themed alternative to `Alert.alert`.
 *
 * - Uses a JS modal when the host is mounted (so it matches in-app dark mode).
 * - Falls back to native `Alert.alert` if the host isn't available (e.g., early boot, unit tests).
 */
export const themedAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
) => {
  if (handler) {
    handler({ title, message, buttons, options });
    return;
  }

  nativeAlertAlert(title, message, buttons, options);
};

/**
 * Optionally routes all `Alert.alert(...)` calls through `themedAlert(...)`.
 *
 * This improves dark-mode consistency without needing to migrate every call site.
 * Safe to call multiple times.
 */
export const installThemedAlertMonkeyPatch = () => {
  if (didInstallMonkeyPatch) return;
  didInstallMonkeyPatch = true;

  // eslint-disable-next-line no-param-reassign
  (Alert as any).alert = (title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => {
    themedAlert(title, message, buttons, options);
  };
};
