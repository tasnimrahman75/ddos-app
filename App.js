import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native';

async function fetchJson(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data && data.detail ? JSON.stringify(data.detail) : 'Server error ' + res.status);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const RISK_COLORS = { HIGH: '#d32f2f', MEDIUM: '#f57c00', LOW: '#2e7d32' };

export default function App() {
 const [urlInput, setUrlInput] = useState('https://ddos-backend-g62v.onrender.com');
  const [apiUrl, setApiUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [health, setHealth] = useState(null);
  const [features, setFeatures] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [formError, setFormError] = useState('');
  const scrollRef = useRef(null);

  const connect = async () => {
    const base = urlInput.trim().replace(/\/+$/, '');
    setConnectError('');
    if (!/^https?:\/\//.test(base)) {
      setConnectError('URL must start with http:// or https://');
      return;
    }
    setConnecting(true);
    try {
      const h = await fetchJson(base + '/health');
      const f = await fetchJson(base + '/features');
      setHealth(h);
      setFeatures(f.features);
      setAnswers({});
      setResult(null);
      setApiUrl(base);
    } catch (e) {
      setConnectError(
        e.name === 'AbortError'
          ? 'Connection timed out. Check the URL, Wi-Fi and firewall.'
          : 'Could not connect: ' + e.message
      );
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    setApiUrl('');
    setHealth(null);
    setFeatures([]);
    setAnswers({});
    setResult(null);
    setFormError('');
  };

  const loadSample = async (kind) => {
    setFormError('');
    try {
      const data = await fetchJson(apiUrl + '/sample/' + kind);
      const next = {};
      Object.entries(data.features).forEach(([k, v]) => {
        next[k] = v === null ? '' : String(v);
      });
      setAnswers(next);
      setResult(null);
    } catch (e) {
      setFormError('Could not load sample: ' + e.message);
    }
  };

  const clearAll = () => {
    setAnswers({});
    setResult(null);
    setFormError('');
  };

  const predict = async () => {
    setFormError('');
    const payload = {};
    for (const f of features) {
      const text = (answers[f.name] || '').trim();
      if (text === '') {
        payload[f.name] = null;
      } else {
        const num = Number(text);
        if (Number.isNaN(num)) {
          setFormError('"' + f.name + '" must be a number.');
          return;
        }
        payload[f.name] = num;
      }
    }
    setLoading(true);
    try {
      const data = await fetchJson(apiUrl + '/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: payload }),
      });
      setResult(data);
      setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 150);
    } catch (e) {
      setFormError(
        e.name === 'AbortError' ? 'Request timed out.' : 'Prediction failed: ' + e.message
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------- Screen 1: connection ----------
  if (!apiUrl) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.title}>DDoS Detector</Text>
          <Text style={styles.subtitle}>Enter your API URL to connect</Text>
          <TextInput
            style={styles.input}
            value={urlInput}
            onChangeText={setUrlInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://ddos-backend-g62v.onrender.com"
          />
          <TouchableOpacity style={styles.button} onPress={connect} disabled={connecting}>
            {connecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Connect</Text>}
          </TouchableOpacity>
          {connectError !== '' && <Text style={styles.error}>{connectError}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  // ---------- Screen 2: form ----------
  const answered = features.filter((f) => (answers[f.name] || '').trim() !== '').length;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.connectedBar}>
          <Text style={styles.connectedText}>Connected | Model: {health && health.model}</Text>
          <TouchableOpacity onPress={disconnect}>
            <Text style={styles.disconnect}>Disconnect</Text>
          </TouchableOpacity>
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.counter}>Answered: {answered} / {features.length} (empty = median is used)</Text>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#d32f2f' }]} onPress={() => loadSample('DDoS')}>
              <Text style={styles.smallBtnText}>DDoS sample</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#2e7d32' }]} onPress={() => loadSample('BENIGN')}>
              <Text style={styles.smallBtnText}>BENIGN sample</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#616161' }]} onPress={clearAll}>
              <Text style={styles.smallBtnText}>Clear</Text>
            </TouchableOpacity>
          </View>

          {features.map((f, i) => (
            <View key={f.name} style={styles.card}>
              <Text style={styles.question}>Question {i + 1}: What is the value of {f.name}?</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={answers[f.name] || ''}
                onChangeText={(t) => setAnswers((prev) => ({ ...prev, [f.name]: t }))}
                placeholder={'median: ' + f.median}
              />
              <Text style={styles.hint}>Range: {f.min} to {f.max}</Text>
            </View>
          ))}

          {formError !== '' && <Text style={styles.error}>{formError}</Text>}

          <TouchableOpacity style={styles.button} onPress={predict} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Predict</Text>}
          </TouchableOpacity>

          {result && (
            <View style={[styles.resultCard, { borderColor: RISK_COLORS[result.risk_level] }]}>
              <View style={[styles.badge, { backgroundColor: result.is_attack ? '#d32f2f' : '#2e7d32' }]}>
                <Text style={styles.badgeText}>{result.is_attack ? 'DDoS ATTACK' : 'BENIGN'}</Text>
              </View>
              <Text style={styles.resultLine}>Confidence: {(result.confidence * 100).toFixed(1)}%</Text>
              <Text style={[styles.resultLine, { color: RISK_COLORS[result.risk_level], fontWeight: 'bold' }]}>
                Risk level: {result.risk_level}
              </Text>
              <Text style={styles.resultLine}>BENIGN probability: {(result.probabilities.BENIGN * 100).toFixed(1)}%</Text>
              <Text style={styles.resultLine}>DDoS probability: {(result.probabilities.DDoS * 100).toFixed(1)}%</Text>
              <Text style={styles.resultMsg}>{result.message}</Text>
              <Text style={styles.hint}>
                Model: {result.model} | Latency: {result.latency_ms} ms | Filled with median: {result.features_filled_with_median}
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8', paddingTop: Platform.OS === 'android' ? 30 : 0 },
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  subtitle: { textAlign: 'center', color: '#555', marginBottom: 20 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 6 },
  button: { backgroundColor: '#1565c0', padding: 14, borderRadius: 8, alignItems: 'center', marginVertical: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  error: { color: '#d32f2f', marginVertical: 8, textAlign: 'center' },
  connectedBar: { backgroundColor: '#2e7d32', padding: 10, flexDirection: 'row', justifyContent: 'space-between' },
  connectedText: { color: '#fff', fontWeight: 'bold' },
  disconnect: { color: '#fff', textDecorationLine: 'underline' },
  scroll: { padding: 16, paddingBottom: 60 },
  counter: { marginBottom: 10, color: '#333' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  smallBtn: { flex: 1, padding: 10, borderRadius: 8, marginHorizontal: 3, alignItems: 'center' },
  smallBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  card: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 10 },
  question: { fontWeight: '600', marginBottom: 6 },
  hint: { color: '#777', fontSize: 12, marginTop: 4 },
  resultCard: { backgroundColor: '#fff', borderWidth: 3, borderRadius: 12, padding: 16, marginTop: 10 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 10 },
  badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  resultLine: { fontSize: 15, marginVertical: 2 },
  resultMsg: { fontSize: 15, fontStyle: 'italic', marginVertical: 8 },
});