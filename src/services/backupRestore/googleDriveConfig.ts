// Prompt 47: Google Drive cloud backups.
//
// To enable Drive sign-in + upload/download, set these IDs from your Google Cloud OAuth client.
// - Android: use the *Web client* ID (OAuth 2.0 Client ID, type: Web application)
// - iOS: optionally provide the iOS client ID if your setup requires it
//
// Keeping these as constants (instead of hardcoding inside UI) makes it easy to wire later to
// secure build-time injection if desired.

export const GOOGLE_DRIVE_WEB_CLIENT_ID = '';
export const GOOGLE_DRIVE_IOS_CLIENT_ID = '';

export const isGoogleDriveConfigured = (): boolean => {
  return Boolean(GOOGLE_DRIVE_WEB_CLIENT_ID && GOOGLE_DRIVE_WEB_CLIENT_ID.trim().length > 0);
};
