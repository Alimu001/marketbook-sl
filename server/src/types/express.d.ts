declare global {
  namespace Express {
    interface AuthContext {
      userId: string;
    }

    interface BusinessContext {
      id: string;
      membershipId: string;
      role: "owner" | "admin" | "staff" | "cashier";
    }

    interface Request {
      auth?: AuthContext;
      business?: BusinessContext;
      validatedQuery?: unknown;
    }
  }
}

export {};
