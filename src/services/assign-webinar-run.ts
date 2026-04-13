import { supabase } from "../config/supabase";

/**
 * Sets ghl_contacts.webinar_run_id to the next upcoming webinar run for this contact.
 * Safe to call after each contact sync; no-op if migrations/RPC are missing (logs warning).
 */
export async function assignNextWebinarRunForContactId(
  contactId: string
): Promise<void> {
  const trimmed = contactId.trim();
  if (trimmed === "") {
    return;
  }
  const { error } = await supabase.rpc("assign_next_webinar_run_for_contact", {
    p_contact_id: trimmed,
  });
  if (error !== null) {
    console.warn(
      "assign_next_webinar_run_for_contact failed (apply migration 007 if missing):",
      error.message
    );
  }
}
