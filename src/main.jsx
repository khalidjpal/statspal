import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { VolleyballPalProvider } from './contexts/VolleyballPalContext';
import App from './App';
import { applySeed, BRAND_SEED } from './theme/md3';
import './styles.css';
import './theme/md3.css';

// Material You colour roles for the brand seed; team screens re-seed later.
applySeed(BRAND_SEED);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <DataProvider>
            <VolleyballPalProvider>
              <App />
            </VolleyballPalProvider>
          </DataProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
