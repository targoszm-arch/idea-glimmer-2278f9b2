

## Plan: Add User Authentication to Fix RLS Issues

### Problem
The RLS policies correctly restrict writes to `authenticated` users, but the app has no login system, so all requests use the `anon` role and get rejected.

### Solution
Add a simple email/password authentication flow so users operate as `authenticated`, making the existing RLS policies work as intended.

### Changes

**1. Create Auth Pages**
- `src/pages/Login.tsx` — Email + password login form with a link to sign up
- `src/pages/Signup.tsx` — Email + password registration form

**2. Create Auth Context**
- `src/contexts/AuthContext.tsx` — React context providing `user`, `session`, `signIn`, `signUp`, `signOut`, and a `loading` state. Wraps `supabase.auth.onAuthStateChange`.

**3. Create Protected Route Wrapper**
- `src/components/ProtectedRoute.tsx` — Redirects to `/login` if no session; renders children if authenticated.

**4. Update Routing (`src/App.tsx`)**
- Add `/login` and `/signup` routes
- Wrap all existing routes with `ProtectedRoute`
- Wrap the app with `AuthProvider`

**5. Add Sign-Out Button**
- Update `src/components/Header.tsx` to show a sign-out button when logged in

**6. No database or RLS changes needed**
The existing `authenticated`-only policies are correct and stay as-is.

### Result
Users sign up / log in → Supabase client holds a valid JWT → all INSERT/UPDATE/DELETE requests pass the existing RLS policies. No security is weakened.

