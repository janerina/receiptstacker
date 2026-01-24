import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import ImageViewer from 'react-native-image-zoom-viewer';
import Feather from 'react-native-vector-icons/Feather';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS, ICON_SIZES, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';

export interface ImageViewerModalProps {
  visible: boolean;
  imageUri: string;
  title?: string;
  onClose: () => void;
}

export const ImageViewerModal = ({ visible, imageUri, title, onClose }: ImageViewerModalProps) => {
  const { isDark } = useTheme();
  const styles = useMemo(() => createStyles(), []);

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onBackButtonPress={onClose}
      style={styles.modal}
      backdropOpacity={0.95}
      useNativeDriver
    >
      <View style={styles.container}>
        <ImageViewer
          imageUrls={[{ url: imageUri }]}
          enableSwipeDown
          onSwipeDown={onClose}
          saveToLocalByLongPress={false}
          backgroundColor={isDark ? '#000' : '#000'}
          renderIndicator={() => <View />}
          failImageSource={Platform.select({ android: undefined, ios: undefined })}
          renderHeader={() => (
            <SafeAreaView edges={['top']} style={styles.headerOverlay}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close image viewer"
                onPress={onClose}
                style={styles.closeButton}
              >
                <Feather name="x" size={ICON_SIZES.md} color={COLORS.common.white} />
              </Pressable>

              <Text numberOfLines={1} style={styles.title}>
                {title ?? 'Receipt Image'}
              </Text>

              <View style={styles.rightSpacer} />
            </SafeAreaView>
          )}
        />
      </View>
    </Modal>
  );
};

const createStyles = () =>
  StyleSheet.create({
    modal: {
      margin: 0,
    },
    container: {
      flex: 1,
      backgroundColor: '#000',
    },
    headerOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.sm,
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 10,
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    closeButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    title: {
      ...TYPOGRAPHY.cardTitle,
      color: COLORS.common.white,
      textAlign: 'center',
      flex: 1,
      paddingHorizontal: SPACING.md,
    },
    rightSpacer: {
      width: 40,
      height: 40,
    },
  });
