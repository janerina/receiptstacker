import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Hook: fade in on mount.
 *
 * @param duration Animation duration in ms.
 */
export const useFadeIn = (duration = 250): Animated.Value => {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [duration, opacity]);

  return opacity;
};

/**
 * Hook: fade out on demand.
 *
 * @param duration Animation duration in ms.
 */
export const useFadeOut = (duration = 200): { opacity: Animated.Value; fadeOut: () => void } => {
  const opacity = useRef(new Animated.Value(1)).current;

  const fadeOut = useCallback(() => {
    Animated.timing(opacity, {
      toValue: 0,
      duration,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [duration, opacity]);

  return { opacity, fadeOut };
};

/**
 * Hook: scale in on mount.
 *
 * @param duration Animation duration in ms.
 */
export const useScaleIn = (duration = 220): Animated.Value => {
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    Animated.timing(scale, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [duration, scale]);

  return scale;
};

/**
 * Hook: subtle press scale animation.
 */
export const usePressScale = (): { scale: Animated.Value; pressIn: () => void; pressOut: () => void } => {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [scale]);

  const pressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [scale]);

  return { scale, pressIn, pressOut };
};

/**
 * Hook: slide in from bottom on mount.
 *
 * Returns translateY.
 */
export const useSlideInFromBottom = (duration = 260): Animated.Value => {
  const translateY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [duration, translateY]);

  return translateY;
};

/**
 * Hook: slide in from right on mount.
 *
 * Returns translateX.
 */
export const useSlideInFromRight = (duration = 260): Animated.Value => {
  const translateX = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: 0,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [duration, translateX]);

  return translateX;
};
