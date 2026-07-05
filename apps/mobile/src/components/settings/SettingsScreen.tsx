import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ColorPicker, { Panel1, HueSlider, InputWidget } from 'reanimated-color-picker';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import PasswordField from '../PasswordField';

const CRIMSON = '#8B1A1A';
const DARK = '#2A1515';

// Mirrors the column defaults in supabase/migrations/004_user_settings.sql
const DEFAULT_PEN_SIZES = { s: 2, m: 4, l: 8 };
const DEFAULT_PEN_COLORS = ['#1a1a1a', '#8B1A1A', '#2563eb', '#16a34a', '#f97316'];

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, setProfile, user, settings, updateSettings } = useAuthStore();

  // ─── Account: display name ────────────────────────────────────────────────
  const [name, setName] = useState(profile?.name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || !profile || trimmed === profile.name) return;
    setNameSaving(true);
    const { error } = await supabase.from('profiles').update({ name: trimmed }).eq('id', profile.id);
    setNameSaving(false);
    if (error) { Alert.alert('Could not update name', error.message); return; }
    setProfile({ ...profile, name: trimmed });
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 1500);
  };

  // ─── Account: change password ──────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const savePassword = async () => {
    setPasswordError('');
    if (!currentPassword || !newPassword) { setPasswordError('Please fill in all fields.'); return; }
    if (newPassword.length < 6) { setPasswordError('New password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('New passwords do not match.'); return; }
    if (!user?.email) { setPasswordError('No email on this account.'); return; }

    setPasswordSaving(true);
    // Re-verify identity before allowing the change, so a left-open session
    // can't silently swap the password without knowing the current one.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyError) {
      setPasswordSaving(false);
      setPasswordError('Current password is incorrect.');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) { setPasswordError(error.message); return; }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    Alert.alert('Password updated', 'Your password has been changed.');
  };

  // ─── Style: pen size (S/M/L, both roles) ───────────────────────────────────
  const [penS, setPenS] = useState(String(settings?.pen_size_s ?? 2));
  const [penM, setPenM] = useState(String(settings?.pen_size_m ?? 4));
  const [penL, setPenL] = useState(String(settings?.pen_size_l ?? 8));
  const [penSaving, setPenSaving] = useState(false);
  const [penSaved, setPenSaved] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setPenS(String(settings.pen_size_s));
    setPenM(String(settings.pen_size_m));
    setPenL(String(settings.pen_size_l));
  }, [settings?.user_id]);

  const parsedS = Number(penS);
  const parsedM = Number(penM);
  const parsedL = Number(penL);
  const penSizeError =
    !penS || !penM || !penL || Number.isNaN(parsedS) || Number.isNaN(parsedM) || Number.isNaN(parsedL)
      ? 'Enter a size for S, M, and L.'
      : !(parsedS > 0 && parsedS < parsedM && parsedM < parsedL)
        ? 'Sizes must stay in order: S < M < L.'
        : '';

  const savePenSizes = async () => {
    if (penSizeError) return;
    setPenSaving(true);
    const { error } = await updateSettings({ pen_size_s: parsedS, pen_size_m: parsedM, pen_size_l: parsedL });
    setPenSaving(false);
    if (error) { Alert.alert('Could not save pen sizes', error); return; }
    setPenSaved(true);
    setTimeout(() => setPenSaved(false), 1500);
  };

  const resetPenSizes = async () => {
    setPenSaving(true);
    const { error } = await updateSettings({
      pen_size_s: DEFAULT_PEN_SIZES.s,
      pen_size_m: DEFAULT_PEN_SIZES.m,
      pen_size_l: DEFAULT_PEN_SIZES.l,
    });
    setPenSaving(false);
    if (error) { Alert.alert('Could not reset pen sizes', error); return; }
    setPenS(String(DEFAULT_PEN_SIZES.s));
    setPenM(String(DEFAULT_PEN_SIZES.m));
    setPenL(String(DEFAULT_PEN_SIZES.l));
    setPenSaved(true);
    setTimeout(() => setPenSaved(false), 1500);
  };

  // ─── Style: pen colors (teacher whiteboard only) ───────────────────────────
  const [colorModalIndex, setColorModalIndex] = useState<number | null>(null);
  const [editingHex, setEditingHex] = useState('#1a1a1a');
  const [colorSaving, setColorSaving] = useState(false);

  const openColorEditor = (index: number) => {
    setEditingHex(settings?.pen_colors[index] ?? '#1a1a1a');
    setColorModalIndex(index);
  };

  const saveColor = async () => {
    if (colorModalIndex === null || !settings) return;
    const next = [...settings.pen_colors];
    next[colorModalIndex] = editingHex.slice(0, 7); // strip any alpha suffix, keep #RRGGBB
    setColorSaving(true);
    const { error } = await updateSettings({ pen_colors: next });
    setColorSaving(false);
    if (error) { Alert.alert('Could not save color', error); return; }
    setColorModalIndex(null);
  };

  const resetPenColors = async () => {
    setColorSaving(true);
    const { error } = await updateSettings({ pen_colors: [...DEFAULT_PEN_COLORS] });
    setColorSaving(false);
    if (error) { Alert.alert('Could not reset colors', error); return; }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Account */}
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Display name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} autoCorrect={false} />
            <TouchableOpacity style={styles.saveBtn} onPress={saveName} disabled={nameSaving}>
              <Text style={styles.saveBtnText}>
                {nameSaving ? 'Saving...' : nameSaved ? 'Saved ✓' : 'Save name'}
              </Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <Text style={styles.label}>Current password</Text>
            <PasswordField
              style={styles.input} value={currentPassword} onChangeText={setCurrentPassword}
              placeholder="••••••••" placeholderTextColor="#bbb"
            />
            <Text style={styles.label}>New password</Text>
            <PasswordField
              style={styles.input} value={newPassword} onChangeText={setNewPassword}
              placeholder="Min. 6 characters" placeholderTextColor="#bbb"
            />
            <Text style={styles.label}>Confirm new password</Text>
            <PasswordField
              style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword}
              placeholder="Re-enter new password" placeholderTextColor="#bbb"
            />
            {passwordError ? <Text style={styles.error}>{passwordError}</Text> : null}
            <TouchableOpacity style={styles.saveBtn} onPress={savePassword} disabled={passwordSaving}>
              <Text style={styles.saveBtnText}>{passwordSaving ? 'Saving...' : 'Change password'}</Text>
            </TouchableOpacity>
          </View>

          {/* Pen size */}
          <Text style={styles.sectionTitle}>Pen Size</Text>
          <View style={styles.card}>
            <View style={styles.sizeRow}>
              {([['S', penS, setPenS], ['M', penM, setPenM], ['L', penL, setPenL]] as const).map(
                ([label, value, setValue]) => {
                  const dotSize = Math.min(56, Math.max(6, (Number(value) || 0) * 4));
                  return (
                    <View key={label} style={styles.sizeCol}>
                      <View style={styles.sizeDotWrap}>
                        <View style={{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: '#1a1a1a' }} />
                      </View>
                      <Text style={styles.sizeLabel}>{label}</Text>
                      <TextInput
                        style={styles.sizeInput}
                        value={value}
                        onChangeText={setValue}
                        keyboardType="numeric"
                      />
                    </View>
                  );
                }
              )}
            </View>
            {penSizeError ? <Text style={styles.error}>{penSizeError}</Text> : null}
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.resetBtn, styles.btnFlex]}
                onPress={resetPenSizes}
                disabled={penSaving}
              >
                <Text style={styles.resetBtnText}>Reset to default</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, styles.btnFlex, !!penSizeError && styles.saveBtnDisabled]}
                onPress={savePenSizes}
                disabled={!!penSizeError || penSaving}
              >
                <Text style={styles.saveBtnText}>{penSaving ? 'Saving...' : penSaved ? 'Saved ✓' : 'Save sizes'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Pen colors — teacher whiteboard only */}
          {profile?.role === 'teacher' && (
            <>
              <Text style={styles.sectionTitle}>Whiteboard Pen Colors</Text>
              <View style={styles.card}>
                <View style={styles.swatchRow}>
                  {(settings?.pen_colors ?? []).map((c, i) => (
                    <TouchableOpacity key={i} onPress={() => openColorEditor(i)}>
                      <View style={[styles.swatch, { backgroundColor: c }]} />
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.resetBtn}
                  onPress={resetPenColors}
                  disabled={colorSaving}
                >
                  <Text style={styles.resetBtnText}>{colorSaving ? 'Saving...' : 'Reset to default'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Color editor bottom sheet */}
      <Modal
        visible={colorModalIndex !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setColorModalIndex(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sheet}>
            <View style={styles.panelHandle} />
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Edit Color</Text>
              <TouchableOpacity onPress={() => setColorModalIndex(null)}>
                <Text style={styles.panelClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {colorModalIndex !== null && (
              <ColorPicker value={editingHex} onChangeJS={c => setEditingHex(c.hex)} style={styles.colorPicker}>
                <Panel1 style={styles.colorPanel} />
                <HueSlider style={styles.hueSlider} />
                <InputWidget formats={['HEX']} defaultFormat="HEX" disableAlphaChannel />
              </ColorPicker>
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={saveColor} disabled={colorSaving}>
              <Text style={styles.saveBtnText}>{colorSaving ? 'Saving...' : 'Save color'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFBF8' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: DARK,
  },
  backBtn: { width: 60 },
  backText: { color: CRIMSON, fontSize: 15, fontWeight: '600' },
  headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 60 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#999',
    letterSpacing: 0.08, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 20,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    borderWidth: 0.5, borderColor: '#E8E2D9',
  },
  label: {
    fontSize: 11, fontWeight: '600', color: '#999',
    letterSpacing: 0.08, textTransform: 'uppercase',
    marginBottom: 6, marginTop: 14,
  },
  input: {
    borderWidth: 0.5, borderColor: '#DDD8D0', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1a1a1a', backgroundColor: '#fff',
  },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 20 },
  error: { color: CRIMSON, fontSize: 13, marginTop: 12 },
  saveBtn: {
    backgroundColor: CRIMSON, borderRadius: 8,
    paddingVertical: 13, alignItems: 'center', marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 10 },
  btnFlex: { flex: 1 },
  resetBtn: {
    borderWidth: 0.5, borderColor: '#DDD8D0', borderRadius: 8,
    paddingVertical: 13, alignItems: 'center', marginTop: 16,
  },
  resetBtnText: { color: '#666', fontSize: 14, fontWeight: '600' },
  sizeRow: { flexDirection: 'row', justifyContent: 'space-around' },
  sizeCol: { alignItems: 'center', gap: 8 },
  sizeDotWrap: { width: 60, height: 60, justifyContent: 'center', alignItems: 'center' },
  sizeLabel: { fontSize: 13, fontWeight: '700', color: '#2A1515' },
  sizeInput: {
    borderWidth: 0.5, borderColor: '#DDD8D0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, width: 56, textAlign: 'center',
    fontSize: 14, color: '#1a1a1a',
  },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: '#E8E2D9' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 24, paddingBottom: 40,
  },
  panelHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  panelTitle: { fontSize: 17, fontWeight: '700', color: '#2A1515' },
  panelClose: { fontSize: 18, color: '#aaa', padding: 4 },
  colorPicker: { gap: 20, marginTop: 8 },
  colorPanel: { borderRadius: 12, height: 200 },
  hueSlider: { borderRadius: 8 },
});
