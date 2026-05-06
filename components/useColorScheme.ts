import { useAppTheme } from '../app/context/ThemeContext';
import { useColorScheme as useDeviceScheme } from 'react-native';

export const useColorScheme = () => {
    try {
        const { resolvedScheme } = useAppTheme();
        return resolvedScheme;
    } catch (e) {
        // Fallback incase it is queried out of context scope during cold boot
        const dev = useDeviceScheme();
        return dev || 'light';
    }
};
