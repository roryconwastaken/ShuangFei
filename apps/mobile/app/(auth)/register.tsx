import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Image,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase, Role } from '../../src/lib/supabase';

const CRIMSON = '#8B1A1A';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [focusedField, setFocusedField] = useState<string | null>(null);
  const focused = (field: string) => focusedField === field;

  const handleRegister = async () => {
    setError('');
    if (!name || !email || !password) { setError('Please fill in all fields.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, role } },
    });
    setLoading(false);
    if (error) setError(error.message);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.logoArea}>
          <Image
            source={require('../../assets/ShuangFei Logo Transparent.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.appName}>SHUANGFEI</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create account</Text>

          {/* Role selector */}
          <Text style={styles.label}>I am a</Text>
          <View style={styles.roleRow}>
            {(['student', 'teacher'] as Role[]).map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.roleBtn, role === r && styles.roleBtnActive]}
                onPress={() => setRole(r)}
              >
                <Text style={styles.roleIcon}>{r === 'student' ? '🎒' : '👩‍🏫'}</Text>
                <Text style={[styles.roleText, role === r && styles.roleTextActive]}>
                  {r === 'student' ? 'Student' : 'Teacher'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={[styles.input, focused('name') && styles.inputFocused]}
            value={name}
            onChangeText={setName}
            onFocus={() => setFocusedField('name')}
            onBlur={() => setFocusedField(null)}
            placeholder="Your name"
            placeholderTextColor="#bbb"
            autoCorrect={false}
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, focused('email') && styles.inputFocused]}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocusedField('email')}
            onBlur={() => setFocusedField(null)}
            placeholder="you@example.com"
            placeholderTextColor="#bbb"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.input, focused('password') && styles.inputFocused]}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocusedField('password')}
            onBlur={() => setFocusedField(null)}
            placeholder="Min. 6 characters"
            placeholderTextColor="#bbb"
            secureTextEntry
          />

          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={[styles.input, focused('confirm') && styles.inputFocused]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onFocus={() => setFocusedField('confirm')}
            onBlur={() => setFocusedField(null)}
            placeholder="Re-enter password"
            placeholderTextColor="#bbb"
            secureTextEntry
          />

          {role === 'teacher' && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                A class code will be generated after registration. Share it with your students so they can join your class.
              </Text>
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btnPrimary, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnPrimaryText}>Create account</Text>
            }
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={styles.link}>Sign in</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFBF8' },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  logoArea: { alignItems: 'center', marginBottom: 20 },
  logo: { width: 90, height: 90 },
  appName: {
    fontSize: 14, fontWeight: '700', color: CRIMSON,
    letterSpacing: 4, marginTop: 4,
  },
  card: {
    width: '100%', maxWidth: 480,
    backgroundColor: '#fff', borderRadius: 16, padding: 28,
    borderWidth: 0.5, borderColor: '#E8E2D9',
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 20 },
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
  inputFocused: {
    borderColor: CRIMSON,
    shadowColor: CRIMSON, shadowOpacity: 0.15,
    shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 0,
  },
  roleRow: { flexDirection: 'row', gap: 10 },
  roleBtn: {
    flex: 1, borderWidth: 0.5, borderColor: '#DDD8D0', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center', backgroundColor: '#fff',
  },
  roleBtnActive: { borderColor: CRIMSON, backgroundColor: 'rgba(139,26,26,0.06)' },
  roleIcon: { fontSize: 22, marginBottom: 4 },
  roleText: { fontSize: 13, fontWeight: '600', color: '#888' },
  roleTextActive: { color: CRIMSON },
  infoBox: {
    backgroundColor: 'rgba(139,26,26,0.06)',
    borderWidth: 0.5, borderColor: 'rgba(139,26,26,0.2)',
    borderRadius: 8, padding: 12, marginTop: 12,
  },
  infoText: { fontSize: 12, color: CRIMSON, lineHeight: 18 },
  error: { color: CRIMSON, fontSize: 13, marginTop: 12, textAlign: 'center' },
  btnPrimary: {
    backgroundColor: CRIMSON, borderRadius: 8,
    paddingVertical: 13, alignItems: 'center', marginTop: 22,
  },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  footerText: { color: '#888', fontSize: 13 },
  link: { color: CRIMSON, fontSize: 13, fontWeight: '600' },
});
