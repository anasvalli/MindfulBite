import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { AlertCircle, CheckCircle } from 'lucide-react-native';

type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type AlertOptions = {
  title: string;
  message: string;
  buttons?: AlertButton[];
};

type CustomAlertContextType = {
  alert: (title: string, message: string, buttons?: AlertButton[]) => void;
};

const CustomAlertContext = createContext<CustomAlertContextType | undefined>(undefined);

export function useCustomAlert() {
  const context = useContext(CustomAlertContext);
  if (!context) {
    throw new Error('useCustomAlert must be used within a CustomAlertProvider');
  }
  return context;
}

export function CustomAlertProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<AlertOptions | null>(null);

  const alert = (title: string, message: string, buttons?: AlertButton[]) => {
    setOptions({ title, message, buttons });
    setVisible(true);
  };

  const closeAlert = () => {
    setVisible(false);
  };

  const isSuccess = options?.title.toLowerCase().includes('success') || options?.title.toLowerCase().includes('logged') || options?.title.toLowerCase().includes('generated');
  const isError = options?.title.toLowerCase().includes('error') || options?.title.toLowerCase().includes('failed') || options?.title.toLowerCase().includes('invalid');

  return (
    <CustomAlertContext.Provider value={{ alert }}>
      {children}
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          {/* Backdrop Blur */}
          <View style={StyleSheet.absoluteFill}>
             <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          </View>
          
          <View style={styles.alertBox}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              {isSuccess ? (
                <View style={[styles.iconWrap, { backgroundColor: '#F0FDF4' }]}>
                  <CheckCircle color="#6FAF4F" size={32} />
                </View>
              ) : isError ? (
                <View style={[styles.iconWrap, { backgroundColor: '#FEF2F2' }]}>
                  <AlertCircle color="#EF4444" size={32} />
                </View>
              ) : null}
            </View>

            <Text style={styles.title}>{options?.title}</Text>
            <Text style={styles.message}>{options?.message}</Text>

            <View style={styles.buttonContainer}>
              {!options?.buttons || options.buttons.length === 0 ? (
                <TouchableOpacity style={[styles.primaryButton, { flex: 1 }]} onPress={closeAlert} activeOpacity={0.75}>
                  <Text style={styles.primaryButtonText}>OK</Text>
                </TouchableOpacity>
              ) : (
                options.buttons.map((btn, index) => {
                  const isCancel = btn.style === 'cancel';
                  const isDestructive = btn.style === 'destructive';
                  
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.flexibleButton,
                        { flex: 1 },
                        isDestructive ? styles.destructiveBtn : (isCancel ? styles.cancelBtn : styles.primaryButton),
                        options.buttons!.length > 1 && { marginLeft: index > 0 ? 10 : 0 }
                      ]}
                      activeOpacity={0.75}
                      onPress={() => {
                        if (btn.onPress) btn.onPress();
                        closeAlert();
                      }}
                    >
                      <Text style={[
                        styles.buttonText,
                        isDestructive ? { color: '#FFFFFF' } : (isCancel ? { color: '#64748B' } : { color: '#FFFFFF' })
                      ]}>
                        {btn.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>
        </View>
      </Modal>
    </CustomAlertContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertBox: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  flexibleButton: {
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#6FAF4F',
    shadowColor: '#6FAF4F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  cancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  destructiveBtn: {
    backgroundColor: '#EF4444',
  },
  buttonText: {
    fontWeight: '800',
    fontSize: 15,
  }
});
