import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  // This index serves strictly as a mounting point for deep-links mapping to `/`.
  // AuthContext handles all actual routing, so we render a loader temporarily.
  return (
    <View style={{ flex: 1, backgroundColor: '#f0fdf4', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#22c55e" />
    </View>
  );
}
