import { spawn } from "node:child_process";
import path from "node:path";
import type { GhlWebhookCredentials } from "./ghl-connection-resolve";

/**
 * Child process env with GHL credentials for this webhook event (not global `process.env` alone).
 */
function ghlSpawnEnv(credentials: GhlWebhookCredentials): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GHL_PRIVATE_INTEGRATION_TOKEN: credentials.privateIntegrationToken,
    GHL_LOCATION_ID: credentials.locationId,
  };
}

/**
 * Runs the same contact upsert pipeline as `npm run sync-ghl-contacts` for one id.
 * Uses the resolved per-location token and location id.
 */
export function runGhlContactSyncForContactId(
  contactId: string,
  credentials: GhlWebhookCredentials
): Promise<void> {
  const trimmed = contactId.trim();
  if (trimmed === "") {
    return Promise.reject(new Error("contactId is empty"));
  }

  const scriptPath = path.join(
    process.cwd(),
    "scripts",
    "sync-ghl-contacts-to-supabase.mjs"
  );

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [scriptPath, `--contact-id=${trimmed}`],
      {
        env: ghlSpawnEnv(credentials),
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `GHL sync script exited with code ${code ?? "null"}: ${stderr.slice(0, 2000)}`
        )
      );
    });
  });
}

/**
 * Runs the orders/invoices sync script for one order id.
 */
export function runGhlOrderSyncForOrderId(
  orderId: string,
  credentials: GhlWebhookCredentials
): Promise<void> {
  const trimmed = orderId.trim();
  if (trimmed === "") {
    return Promise.reject(new Error("orderId is empty"));
  }
  const scriptPath = path.join(
    process.cwd(),
    "scripts",
    "sync-ghl-orders-invoices-to-supabase.mjs"
  );
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, `--order-id=${trimmed}`], {
      env: ghlSpawnEnv(credentials),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      reject(err);
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `GHL order sync script exited with code ${code ?? "null"}: ${stderr.slice(0, 2000)}`
        )
      );
    });
  });
}

/**
 * Runs the orders/invoices sync script for one invoice id.
 */
export function runGhlInvoiceSyncForInvoiceId(
  invoiceId: string,
  credentials: GhlWebhookCredentials
): Promise<void> {
  const trimmed = invoiceId.trim();
  if (trimmed === "") {
    return Promise.reject(new Error("invoiceId is empty"));
  }
  const scriptPath = path.join(
    process.cwd(),
    "scripts",
    "sync-ghl-orders-invoices-to-supabase.mjs"
  );
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, `--invoice-id=${trimmed}`], {
      env: ghlSpawnEnv(credentials),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      reject(err);
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `GHL invoice sync script exited with code ${code ?? "null"}: ${stderr.slice(0, 2000)}`
        )
      );
    });
  });
}

/**
 * Spawns an MJS script under `scripts/` with `process.env` unchanged (DB-backed `--connection-id` flows).
 *
 * @param scriptFile - Filename under `scripts/` (e.g. `sync-ghl-contacts-to-supabase.mjs`).
 * @param argv - Arguments after the script path.
 * @param errorLabel - Short label for exit error messages.
 */
function runGhlMjsScriptWithProcessEnv(
  scriptFile: string,
  argv: string[],
  errorLabel: string
): Promise<void> {
  const scriptPath = path.join(process.cwd(), "scripts", scriptFile);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...argv], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${errorLabel} exited with code ${code ?? "null"}: ${stderr.slice(0, 2000)}`
        )
      );
    });
  });
}

/**
 * Full GHL contact sync for one `ghl_connections` row (`--connection-id`).
 * Loads token from DB; same pipeline as CLI without `--contact-id`.
 */
export function runGhlFullContactSyncForConnectionId(
  connectionId: string
): Promise<void> {
  const trimmed = connectionId.trim();
  if (trimmed === "") {
    return Promise.reject(new Error("connectionId is empty"));
  }
  return runGhlMjsScriptWithProcessEnv(
    "sync-ghl-contacts-to-supabase.mjs",
    [`--connection-id=${trimmed}`],
    "GHL contacts full sync script"
  );
}

/**
 * Full GHL orders + invoices sync for one `ghl_connections` row (`--connection-id`).
 */
export function runGhlFullOrdersInvoicesSyncForConnectionId(
  connectionId: string
): Promise<void> {
  const trimmed = connectionId.trim();
  if (trimmed === "") {
    return Promise.reject(new Error("connectionId is empty"));
  }
  return runGhlMjsScriptWithProcessEnv(
    "sync-ghl-orders-invoices-to-supabase.mjs",
    [`--connection-id=${trimmed}`],
    "GHL orders/invoices full sync script"
  );
}
