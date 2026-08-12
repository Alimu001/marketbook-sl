import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { getUserFacingErrorMessage } from "@/api/errors";
import {
  clearRefreshToken,
  getRefreshToken,
  saveRefreshToken,
} from "@/auth/tokenStorage";

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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    } catch {
      await clearRefreshToken();
      setAccessToken(null);
      setUser(null);
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
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: Boolean(user && accessToken),
      isLoading,
      login,
      register,
      logout,
    }),
    [user, accessToken, isLoading, login, register, logout],
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
