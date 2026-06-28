import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Image,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../src/lib/supabase';

const CRIMSON = '#8B1A1A';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoArea}>
          <Image
            source={require('../../assets/ShuangFei Logo Transparent.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.appName}>SHUANGFEI</Text>
          <Text style={styles.appSub}>Chinese Writing Practice</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, emailFocused && styles.inputFocused]}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            placeholder="you@example.com"
            placeholderTextColor="#bbb"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.input, passwordFocused && styles.inputFocused]}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            placeholder="••••••••"
            placeholderTextColor="#bbb"
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btnPrimary, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnPrimaryText}>Sign in</Text>
            }
          </TouchableOpacity>

          <View style={styles.sep}>
            <View style={styles.sepLine} />
            <Text style={styles.sepText}>or</Text>
            <View style={styles.sepLine} />
          </View>

          <Link href="/(auth)/register" asChild>
            <TouchableOpacity style={styles.btnOutline}>
              <Text style={styles.btnOutlineText}>Create an account</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFBF8' },
  inner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logoArea: { alignItems: 'center', marginBottom: 28 },
  logo: { width: 110, height: 110 },
  appName: {
    fontSize: 15, fontWeight: '700', color: CRIMSON,
    letterSpacing: 4, marginTop: 6,
  },
  appSub: { fontSize: 11, color: '#aaa', marginTop: 3, letterSpacing: 0.5 },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    borderWidth: 0.5,
    borderColor: '#E8E2D9',
  },
  cardTitle: {
    fontSize: 20, fontWeight: '700', color: '#1a1a1a',
    marginBottom: 20,
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
  inputFocused: {
    borderColor: CRIMSON,
    shadowColor: CRIMSON, shadowOpacity: 0.15,
    shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 0,
  },
  error: { color: CRIMSON, fontSize: 13, marginTop: 12, textAlign: 'center' },
  btnPrimary: {
    backgroundColor: CRIMSON, borderRadius: 8,
    paddingVertical: 13, alignItems: 'center', marginTop: 22,
  },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  sep: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  sepLine: { flex: 1, height: 0.5, backgroundColor: '#E8E2D9' },
  sepText: { fontSize: 11, color: '#bbb' },
  btnOutline: {
    borderWidth: 0.5, borderColor: '#DDD8D0', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  btnOutlineText: { fontSize: 14, color: '#666', fontWeight: '500' },
});
