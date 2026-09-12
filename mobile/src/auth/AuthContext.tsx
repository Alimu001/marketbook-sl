import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  refresh as refreshRequest,
  register as registerRequest,
  type PublicUser,
} from "@/api/auth";
import { ApiError, getUserFacingErrorMessage } from "@/api/errors";
import {
  clearOfflineSession,
  clearRefreshToken,
  getOfflineSession,
  getRefreshToken,
  saveOfflineSession,
  saveRefreshToken,
} from "@/auth/tokenStorage";
import NetInfo from "@react-native-community/netinfo";

interface AuthContextValue {
  user: PublicUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: PublicUser) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const reconnectRefreshInFlight = useRef(false);
  const wasOffline = useRef(false);

  const restoreSession = useCallback(async () => {
    const storedRefreshToken = await getRefreshToken();

    if (!storedRefreshToken) {
      setIsLoading(false);
      return;
    }

    try {
      const tokens = await refreshRequest(storedRefreshToken);
      await saveRefreshToken(tokens.refreshToken);
      setAccessToken(tokens.accessToken);

      const currentUser = await getCurrentUser(tokens.accessToken);
      setUser(currentUser);
      await saveOfflineSession({
        accessToken: tokens.accessToken,
        user: currentUser,
      });
    } catch (error) {
      const cachedSession = await getOfflineSession();

      if (error instanceof ApiError && error.status === 0 && cachedSession) {
        setAccessToken(cachedSession.accessToken);
        setUser(cachedSession.user);
      } else {
        await Promise.all([clearRefreshToken(), clearOfflineSession()]);
        setAccessToken(null);
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await loginRequest({ email, password });
    await saveRefreshToken(response.refreshToken);
    setAccessToken(response.accessToken);
    setUser(response.user);
    await saveOfflineSession({
      accessToken: response.accessToken,
      user: response.user,
    });
  }, []);

  const register = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      await registerRequest(input);
    },
    [],
  );

  const logout = useCallback(async () => {
    const storedRefreshToken = await getRefreshToken();

    try {
      if (storedRefreshToken) {
        await logoutRequest(storedRefreshToken);
      }
    } catch {
      // Local session cleanup still proceeds if the server is unreachable.
    } finally {
      await clearRefreshToken();
      await clearOfflineSession();
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const updateUser = useCallback(async (nextUser: PublicUser) => {
    setUser(nextUser);
    setAccessToken((currentToken) => {
      if (currentToken) {
        void saveOfflineSession({ accessToken: currentToken, user: nextUser });
      }
      return currentToken;
    });
  }, []);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      const online =
        state.isConnected === true && state.isInternetReachable !== false;

      if (!online) {
        wasOffline.current = true;
        return;
      }

      if (!wasOffline.current || !user || reconnectRefreshInFlight.current) {
        return;
      }

      wasOffline.current = false;
      reconnectRefreshInFlight.current = true;

      void (async () => {
        const storedRefreshToken = await getRefreshToken();
        if (!storedRefreshToken) return;

        try {
          const tokens = await refreshRequest(storedRefreshToken);
          await saveRefreshToken(tokens.refreshToken);
          setAccessToken(tokens.accessToken);
          await saveOfflineSession({ accessToken: tokens.accessToken, user });
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            await Promise.all([clearRefreshToken(), clearOfflineSession()]);
            setAccessToken(null);
            setUser(null);
          }
        } finally {
          reconnectRefreshInFlight.current = false;
        }
      })();
    });
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: Boolean(user && accessToken),
      isLoading,
      login,
      register,
      logout,
      updateUser,
    }),
    [user, accessToken, isLoading, login, register, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}

export { getUserFacingErrorMessage };
