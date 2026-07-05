import { useState } from 'react';
import { View, TextInput, TouchableOpacity, TextInputProps, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

interface PasswordFieldProps extends Omit<TextInputProps, 'secureTextEntry'> {
  iconColor?: string;
}

// Drop-in replacement for a secureTextEntry TextInput that adds a show/hide
// eye toggle — used by login, register, and the change-password form.
export default function PasswordField({ style, iconColor = '#999', ...rest }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextInput {...rest} style={[style, styles.input]} secureTextEntry={!visible} />
      <TouchableOpacity
        onPress={() => setVisible(v => !v)}
        style={styles.toggle}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialCommunityIcons name={visible ? 'eye-off' : 'eye'} size={18} color={iconColor} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
  input: { paddingRight: 44 },
  toggle: {
    position: 'absolute', right: 12, top: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
});
