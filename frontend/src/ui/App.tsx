/** Root: sign-in gate (F0), then the role's shell and routes (ui_spec
 * sections 2 and 3.5). Routing here is presentation only -- the API is the
 * authority, and a 403 from it shows the same friendly "No access" state. */

import { useCallback, type JSX } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { APPLICATION_ROUTE, LANDING_NAME, canOpen, landingPath } from '../config/roleRoutes';
import { displayNameFromEmail } from '../service/displayName';
import { useAuth, type UseAuthResult } from '../service/useAuth';
import type { Role } from '../types/auth';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AppShell } from './components/AppShell';
import { FullPageState, type FullPageStateProps } from './components/FullPageState';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { PolicyEditorPage } from './pages/PolicyEditorPage';
import { ReviewPage } from './pages/ReviewPage';

const SIGN_IN_PATH = '/sign-in';

type Home = NonNullable<FullPageStateProps['home']>;

function intendedPath(state: unknown): string | null {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && from !== SIGN_IN_PATH ? from : null;
}

function SignedOut({ auth }: { auth: UseAuthResult }): JSX.Element {
  const location = useLocation();
  if (location.pathname !== SIGN_IN_PATH) {
    return <Navigate to={SIGN_IN_PATH} replace state={{ from: location.pathname }} />;
  }
  return <LoginPage onLogin={auth.login} error={auth.error} loading={auth.loading} />;
}

function PolicyRoute({ role, home }: { role: Role; home: Home }): JSX.Element {
  if (canOpen(role, '/policies')) return <PolicyEditorPage />;
  return <FullPageState title="No access" message="Your role cannot open this page." home={home} />;
}

function ReviewRoute({ role, home }: { role: Role; home: Home }): JSX.Element {
  if (canOpen(role, '/applications/0')) return <ReviewPage role={role} />;
  return <FullPageState title="No access" message="Your role cannot open this page." home={home} />;
}

function NotFoundRoute({ home }: { home: Home }): JSX.Element {
  return <FullPageState title="Not found" message="We could not find that page." home={home} />;
}

function RoleRoutes({ role, home }: { role: Role; home: Home }): JSX.Element {
  const toLanding = <Navigate to={home.to} replace />;
  const homePage = <HomePage role={role} />;
  const policies = <PolicyRoute role={role} home={home} />;
  const review = <ReviewRoute role={role} home={home} />;
  const notFound = <NotFoundRoute home={home} />;
  return (
    <Routes>
      <Route path="/" element={toLanding} />
      <Route path="/home" element={homePage} />
      <Route path="/policies" element={policies} />
      <Route path={APPLICATION_ROUTE} element={review} />
      <Route path="*" element={notFound} />
    </Routes>
  );
}

interface SignedInProps {
  role: Role;
  userName: string;
  onSignOut: () => void;
}

function SignedIn({ role, userName, onSignOut }: SignedInProps): JSX.Element {
  const location = useLocation();
  const landing = landingPath(role);
  if (location.pathname === SIGN_IN_PATH) {
    return <Navigate to={intendedPath(location.state) ?? landing} replace />;
  }
  return (
    <AppShell role={role} userName={userName} onSignOut={onSignOut}>
      <RoleRoutes role={role} home={{ to: landing, label: LANDING_NAME[role] }} />
    </AppShell>
  );
}

export function App(): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const { logout } = auth;
  const signOut = useCallback((): void => {
    navigate(SIGN_IN_PATH, { replace: true });
    logout();
  }, [navigate, logout]);

  return (
    <AppErrorBoundary onSignOut={signOut}>
      {auth.token && auth.role ? (
        <SignedIn role={auth.role} userName={displayNameFromEmail(auth.email)} onSignOut={signOut} />
      ) : (
        <SignedOut auth={auth} />
      )}
    </AppErrorBoundary>
  );
}
