import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { launchImageLibrary } from 'react-native-image-picker';

import { Button, Input } from '@/components/common';
import { COLORS, GRADIENTS, SPACING, TYPOGRAPHY } from '@/constants';
import { useAuth } from '@/contexts';
import { useTheme } from '@/hooks/useTheme';
import type { MainStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'EditProfile'>;

type UserProfile = {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  bio: string;
};

const PROFILE_KEY = '@user_profile' as const;

const defaultProfile: UserProfile = {
  firstName: 'John',
  lastName: 'Doe',
  phone: '+1 (555) 123-4567',
  address: '123 Main St, San Francisco, CA 94102',
  bio: 'Managing my expenses efficiently with ReceiptStacker',
};

const initialsFor = (firstName: string, lastName: string) => {
  const a = (firstName.trim()[0] ?? '').toUpperCase();
  const b = (lastName.trim()[0] ?? '').toUpperCase();
  return `${a}${b}`.trim() || 'U';
};

export const EditProfileScreen = ({ navigation }: Props) => {
  const { colors } = useTheme();
  const { user, updateProfile } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [bio, setBio] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const displayName = user?.name?.trim() || '';
        const [nameFirst = '', nameLast = ''] = displayName.split(' ');

        setAvatar(typeof user?.avatar === 'string' ? user.avatar : null);
        setEmail(user?.email ?? '');

        const rawProfile = await AsyncStorage.getItem(PROFILE_KEY);
        const parsedProfile = rawProfile ? (JSON.parse(rawProfile) as Partial<UserProfile>) : null;

        setFirstName(typeof parsedProfile?.firstName === 'string' ? parsedProfile.firstName : nameFirst || defaultProfile.firstName);
        setLastName(typeof parsedProfile?.lastName === 'string' ? parsedProfile.lastName : nameLast || defaultProfile.lastName);
        setPhone(typeof parsedProfile?.phone === 'string' ? parsedProfile.phone : defaultProfile.phone);
        setAddress(typeof parsedProfile?.address === 'string' ? parsedProfile.address : defaultProfile.address);
        setBio(typeof parsedProfile?.bio === 'string' ? parsedProfile.bio : defaultProfile.bio);
      } catch {
        // Non-fatal
      }
    })();
  }, [user?.avatar, user?.email, user?.name]);

  const pickAvatar = useCallback(async () => {
    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.8,
      });

      const uri = res.assets?.[0]?.uri;
      if (uri) setAvatar(uri);
    } catch {
      Alert.alert('Error', 'Failed to pick image');
    }
  }, []);

  const handleSave = useCallback(async () => {
    const nextFirst = firstName.trim();
    const nextLast = lastName.trim();
    const nextEmail = email.trim();

    if (!nextFirst || !nextLast || !nextEmail) {
      Alert.alert('Missing Info', 'Please enter your first name, last name, and email.');
      return;
    }

    const fullName = `${nextFirst} ${nextLast}`.trim();
    const profile: UserProfile = {
      firstName: nextFirst,
      lastName: nextLast,
      phone: phone.trim(),
      address: address.trim(),
      bio: bio.trim(),
    };

    try {
      setLoading(true);
      await updateProfile({ name: fullName, email: nextEmail, avatar: avatar ?? undefined });
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  }, [address, avatar, bio, email, firstName, lastName, navigation, phone, updateProfile]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.closePressed]}
        >
          <Feather name="x" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.flex1}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarSquare}>
              <LinearGradient colors={[...GRADIENTS.primary]} style={StyleSheet.absoluteFill} />
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitials}>{initialsFor(firstName, lastName)}</Text>
              )}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change photo"
              onPress={pickAvatar}
              style={({ pressed }) => [styles.cameraBtn, pressed && styles.closePressed]}
            >
              <Feather name="camera" size={18} color={COLORS.common.white} />
            </Pressable>
          </View>

          <View style={styles.row}>
            <View style={styles.flex1}>
              <Input label="First Name" value={firstName} onChangeText={setFirstName} placeholder="John" />
            </View>
            <View style={{ width: SPACING.md }} />
            <View style={styles.flex1}>
              <Input label="Last Name" value={lastName} onChangeText={setLastName} placeholder="Doe" />
            </View>
          </View>

          <View style={styles.fieldSpacer} />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="john@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <View style={styles.fieldSpacer} />
          <Input
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 (555) 123-4567"
            keyboardType="phone-pad"
            autoCapitalize="none"
          />

          <View style={styles.fieldSpacer} />
          <Input
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="123 Main St, City, State"
            autoCapitalize="sentences"
          />

          <View style={styles.fieldSpacer} />
          <Input
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="Write something about you"
            multiline
            numberOfLines={4}
            minHeight={120}
          />

          <View style={{ height: SPACING.xl }} />
          <Button title="Save Changes" variant="primary" size="lg" fullWidth onPress={handleSave} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: { background: string; surface: string; border: string; text: string; textSecondary: string }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex1: {
      flex: 1,
    },
    header: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      ...TYPOGRAPHY.sectionHeading,
      color: colors.text,
    },
    closeBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    closePressed: {
      opacity: 0.75,
    },
    content: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.xl,
      paddingBottom: SPACING['2xl'],
    },
    avatarWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.xl,
    },
    avatarSquare: {
      width: 98,
      height: 98,
      borderRadius: 18,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.brand.primary,
    },
    avatarImage: {
      width: 98,
      height: 98,
      resizeMode: 'cover',
    },
    avatarInitials: {
      fontSize: 34,
      fontWeight: '800',
      color: COLORS.common.white,
      letterSpacing: 1,
    },
    cameraBtn: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: COLORS.brand.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: colors.background,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    fieldSpacer: {
      height: SPACING.md,
    },
  });
