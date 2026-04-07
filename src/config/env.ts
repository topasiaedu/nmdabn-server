import dotenv from 'dotenv';

dotenv.config();

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

interface EnvConfig {
  supabase: {
    url: string;
    serviceRoleKey: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  server: {
    port: number;
    nodeEnv: string;
  };
  ghl: GhlConfig | undefined;
}

function validateEnv(): EnvConfig {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

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

  return {
    supabase: {
      url: process.env.SUPABASE_URL!,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri: process.env.GOOGLE_REDIRECT_URI!,
    },
    server: {
      port: parseInt(process.env.PORT || '3000', 10),
      nodeEnv: process.env.NODE_ENV || 'development',
    },
    ghl,
  };
}

export const env = validateEnv();

