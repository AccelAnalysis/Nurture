import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './providers/AuthProvider';
import { CurrentUserProvider } from './providers/CurrentUserProvider';
import { OrganizationProvider } from './providers/OrganizationProvider';
import { ReferralProvider } from './providers/ReferralProvider';
import { NotificationProvider } from './providers/NotificationProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
import './styles-responsive.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <CurrentUserProvider>
            <ReferralProvider>
              <OrganizationProvider>
                <NotificationProvider>
                  <App />
                </NotificationProvider>
              </OrganizationProvider>
            </ReferralProvider>
          </CurrentUserProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
