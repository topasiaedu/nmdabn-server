"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export function useSupabaseSession(): {
  session: Session | null;
  loading: boolean;
  accessToken: string;
  loggedIn: boolean;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    // If the user logged in with "Remember me" unchecked, Supabase's session was
    // moved to sessionStorage. Restore it back into localStorage so the Supabase
    // client can pick it up on this page load, then remove it from sessionStorage.
    if (typeof window !== "undefined") {
      const keys = Object.keys(window.sessionStorage).filter(
        (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
      );
      for (const key of keys) {
        const value = window.sessionStorage.getItem(key);
        if (value !== null && window.localStorage.getItem(key) === null) {
          window.localStorage.setItem(key, value);
          window.sessionStorage.removeItem(key);
        }
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const accessToken = session?.access_token ?? "";
  const loggedIn = useMemo(() => accessToken.trim() !== "", [accessToken]);

  return { session, loading, accessToken, loggedIn };
}
