import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const hasValidUrl =
  supabaseUrl.startsWith("https://") || supabaseUrl.startsWith("http://");
const effectiveSupabaseUrl = hasValidUrl ? supabaseUrl : "https://example.com";
const effectiveAnonKey = supabaseAnonKey !== "" ? supabaseAnonKey : "missing-key";

if (!hasValidUrl || supabaseAnonKey === "") {
  console.warn(
    "Set NEXT_PUBLIC_SUPABASE_URL as full http(s) URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend env."
  );
}

export const supabase = createClient(effectiveSupabaseUrl, effectiveAnonKey);
