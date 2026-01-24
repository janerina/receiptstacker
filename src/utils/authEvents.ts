import { DeviceEventEmitter, type EmitterSubscription } from 'react-native';

export const AUTH_CHANGED_EVENT = 'receiptstacker.auth_changed' as const;

export const emitAuthChanged = () => {
  DeviceEventEmitter.emit(AUTH_CHANGED_EVENT);
};

export const subscribeAuthChanged = (handler: () => void): EmitterSubscription =>
  DeviceEventEmitter.addListener(AUTH_CHANGED_EVENT, handler);
