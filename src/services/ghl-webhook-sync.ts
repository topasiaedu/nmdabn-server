import { spawn } from "node:child_process";
import path from "node:path";

/**
 * Runs the same contact upsert pipeline as `npm run sync-ghl-contacts` for one id.
 * Expects GHL + Supabase env vars (inherited from the server process).
 */
export function runGhlContactSyncForContactId(contactId: string): Promise<void> {
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
        env: process.env,
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
export function runGhlOrderSyncForOrderId(orderId: string): Promise<void> {
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
      env: process.env,
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
export function runGhlInvoiceSyncForInvoiceId(invoiceId: string): Promise<void> {
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
      env: process.env,
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
