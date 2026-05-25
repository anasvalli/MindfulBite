import { View, ActivityIndicator } from 'react-native';
import { A6 } from '../lib/theme';

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: A6.bgInk,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      <ActivityIndicator size="large" color={A6.primaryLight} />
    </View>
  );
}
