import { loadTrafficAgencyLineTags } from "./traffic";
import { parseGhlConnectionTokenEncryptionKey } from "@/services/ghl-connection-token-crypto";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

/** Present when GHL_PRIVATE_INTEGRATION_TOKEN and GHL_LOCATION_ID are both set. */
export interface GhlConfig {
  privateIntegrationToken: string;
  locationId: string;
  apiVersionContacts: string;
  /**
   * If true, skip Ed25519/RSA signature checks (development only; ignored when NODE_ENV=production).
   */
  webhookSkipVerify: boolean;
}

/**
 * Present only when all three GOOGLE_* env vars are set.
 * Google Sheets integration is optional — routes that need this will return 501 when absent.
 */
export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Present only when all three META_* env vars are set.
 * Meta Ads OAuth — routes return 501 when absent.
 */
export interface MetaConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export interface EnvConfig {
  supabase: {
    url: string;
    serviceRoleKey: string;
  };
  /** Undefined when Google OAuth env vars are not configured. */
  google: GoogleConfig | undefined;
  /** Undefined when Meta Ads OAuth env vars are not configured. */
  meta: MetaConfig | undefined;
  server: {
    nodeEnv: string;
  };
  ghl: GhlConfig | undefined;
  /** Traffic dashboard: line key → GHL tag names (from TRAFFIC_AGENCY_LINE_TAGS_JSON). */
  trafficAgencyLineTags: Record<string, string[]>;
  /** GHL custom field id for occupation (optional; overridable per request). */
  trafficOccupationFieldId: string | undefined;
  /** If set in production, required on `x-traffic-key` for dashboard routes. */
  trafficDashboardApiKey: string | undefined;
  /**
   * True when `GHL_CONNECTION_TOKEN_ENCRYPTION_KEY` is set and parses successfully.
   * Used for encrypting integration secrets and decrypting stored GHL tokens.
   */
  encryptionKeyLoaded: boolean;
}

function validateEnv(): EnvConfig {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();

  const ghlToken = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const ghlLocation = process.env.GHL_LOCATION_ID;
  const skipRaw = process.env.GHL_WEBHOOK_SKIP_VERIFY;
  const webhookSkipVerify =
    skipRaw === "1" || skipRaw?.toLowerCase() === "true";

  const ghl: GhlConfig | undefined =
    ghlToken !== undefined &&
    ghlToken !== "" &&
    ghlLocation !== undefined &&
    ghlLocation !== ""
      ? {
          privateIntegrationToken: ghlToken,
          locationId: ghlLocation,
          apiVersionContacts:
            process.env.GHL_API_VERSION_CONTACTS ?? "2021-07-28",
          webhookSkipVerify,
        }
      : undefined;

  const trafficAgencyLineTags = loadTrafficAgencyLineTags(
    process.env.TRAFFIC_AGENCY_LINE_TAGS_JSON
  );
  const trafficOccRaw = process.env.TRAFFIC_OCCUPATION_FIELD_ID;
  const trafficOccupationFieldId =
    trafficOccRaw !== undefined && trafficOccRaw.trim() !== ""
      ? trafficOccRaw.trim()
      : undefined;
  const trafficKeyRaw = process.env.TRAFFIC_DASHBOARD_API_KEY;
  const trafficDashboardApiKey =
    trafficKeyRaw !== undefined && trafficKeyRaw.trim() !== ""
      ? trafficKeyRaw.trim()
      : undefined;

  const ghlEncRaw = process.env.GHL_CONNECTION_TOKEN_ENCRYPTION_KEY;
  let encryptionKeyLoaded = false;
  if (ghlEncRaw !== undefined && ghlEncRaw.trim() !== "") {
    parseGhlConnectionTokenEncryptionKey(ghlEncRaw);
    encryptionKeyLoaded = true;
  } else {
    console.warn(
      "GHL_CONNECTION_TOKEN_ENCRYPTION_KEY is not set; encrypting integration secrets and decrypting GHL tokens will fail until configured."
    );
  }

  const google: GoogleConfig | undefined =
    googleClientId !== undefined &&
    googleClientId !== "" &&
    googleClientSecret !== undefined &&
    googleClientSecret !== "" &&
    googleRedirectUri !== undefined &&
    googleRedirectUri !== ""
      ? { clientId: googleClientId, clientSecret: googleClientSecret, redirectUri: googleRedirectUri }
      : undefined;

  const metaAppId = process.env.META_APP_ID?.trim();
  const metaAppSecret = process.env.META_APP_SECRET?.trim();
  const metaRedirectUri = process.env.META_REDIRECT_URI?.trim();

  const meta: MetaConfig | undefined =
    metaAppId !== undefined &&
    metaAppId !== "" &&
    metaAppSecret !== undefined &&
    metaAppSecret !== "" &&
    metaRedirectUri !== undefined &&
    metaRedirectUri !== ""
      ? { appId: metaAppId, appSecret: metaAppSecret, redirectUri: metaRedirectUri }
      : undefined;

  return {
    supabase: {
      url: supabaseUrl,
      serviceRoleKey: supabaseServiceRoleKey,
    },
    google,
    meta,
    server: {
      nodeEnv: process.env.NODE_ENV || "development",
    },
    ghl,
    trafficAgencyLineTags,
    trafficOccupationFieldId,
    trafficDashboardApiKey,
    encryptionKeyLoaded,
  };
}

export const env = validateEnv();

