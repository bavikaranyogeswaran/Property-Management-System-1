// ============================================================================
//  FRONTEND ENTRY POINT (The Main Map)
// ============================================================================
//  This file acts as the Root Configuration for the application.
//  It initializes providers (Auth, Theme, etc.) and sets up the router.
//  The actual route definitions live in AppRoutes.tsx.
// ============================================================================

import { BrowserRouter } from 'react-router-dom';
import { AppProviders } from './providers';
import { AppRoutes } from './AppRoutes';
import { Toaster } from '@/components/ui/sonner';

/**
 * Root Application Component
 */
export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AppRoutes />
        <Toaster />
      </BrowserRouter>
    </AppProviders>
  );
}
