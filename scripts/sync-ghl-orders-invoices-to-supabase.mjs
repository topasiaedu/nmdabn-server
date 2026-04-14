/**
 * Syncs GHL orders + invoices into normalized mirror tables.
 *
 * Tables (migration 005):
 * - ghl_orders
 * - ghl_order_line_items
 * - ghl_invoices
 * - ghl_invoice_line_items
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GHL_PRIVATE_INTEGRATION_TOKEN, GHL_LOCATION_ID
 * Optional:
 *   GHL_API_VERSION_PAYMENTS (default 2021-07-28)
 *   GHL_THROTTLE_MS (default 120)
 *   GHL_ORDERS_LIST_PATH (default /payments/orders/)
 *   GHL_ORDERS_DETAIL_PATH_TEMPLATE (default /payments/orders/{id})
 *   GHL_INVOICES_LIST_PATH (default /invoices/)
 *   GHL_INVOICES_DETAIL_PATH_TEMPLATE (default /invoices/{id})
 * Flags:
 *   --max-orders=N
 *   --max-invoices=N
 *   --order-id=ID
 *   --invoice-id=ID
 * Multi-location: --connection-id=UUID or --project-id=UUID (ghl_connections + GHL_CONNECTION_TOKEN_ENCRYPTION_KEY)
 */
import { createClient } from "@supabase/supabase-js";
import { loadGhlCredentialsFromDb } from "./lib/load-ghl-credentials-from-db.mjs";

const BASE = "https://services.leadconnectorhq.com";
const PAGE_LIMIT = 100;

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function requireEnv(name, value) {
  if (!value || value === "") {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throttleMsFromEnv() {
  const raw = process.env.GHL_THROTTLE_MS;
  const n = raw !== undefined && raw !== "" ? parseInt(raw, 10) : 120;
  if (!Number.isFinite(n) || n < 0) {
    return 120;
  }
  return n;
}

function parseIso(v) {
  if (typeof v !== "string" || v.trim() === "") {
    return null;
  }
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms).toISOString();
}

function parseNum(v) {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

function asJsonObject(v) {
  if (!isRecord(v)) {
    return {};
  }
  try {
    const encoded = JSON.stringify(v);
    const parsed = JSON.parse(encoded);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function firstString(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v !== "") {
      return v;
    }
  }
  return null;
}

function parseArgs() {
  const out = {
    maxOrders: "",
    maxInvoices: "",
    orderId: "",
    invoiceId: "",
    connectionId: "",
    projectId: "",
  };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--max-orders=")) {
      out.maxOrders = a.slice("--max-orders=".length);
    } else if (a.startsWith("--max-invoices=")) {
      out.maxInvoices = a.slice("--max-invoices=".length);
    } else if (a.startsWith("--order-id=")) {
      out.orderId = a.slice("--order-id=".length);
    } else if (a.startsWith("--invoice-id=")) {
      out.invoiceId = a.slice("--invoice-id=".length);
    } else if (a.startsWith("--connection-id=")) {
      out.connectionId = a.slice("--connection-id=".length);
    } else if (a.startsWith("--project-id=")) {
      out.projectId = a.slice("--project-id=".length);
    }
  }
  return out;
}

function normalizeItem(item, parentId, locationId, position) {
  if (!isRecord(item)) {
    return null;
  }
  const itemId = firstString(item, ["id", "itemId", "productId"]);
  const sku = firstString(item, ["sku", "productSku"]);
  const name = firstString(item, ["name", "title", "productName"]);
  const price = parseNum(item.price ?? item.unitPrice ?? item.amount);
  const quantity = parseNum(item.quantity ?? item.qty ?? 1);
  const lineTotal = parseNum(item.total ?? item.lineTotal ?? item.amountTotal);
  return {
    parentId,
    row: {
      location_id: locationId,
      position,
      item_id: itemId,
      sku,
      name,
      price,
      quantity,
      line_total: lineTotal,
      raw_json: asJsonObject(item),
      synced_at: new Date().toISOString(),
    },
  };
}

function buildOrderRow(order, defaultLocationId) {
  const id = firstString(order, ["id", "orderId"]);
  if (id === null) {
    throw new Error("Order payload missing id/orderId");
  }
  const locationId = firstString(order, ["locationId"]) ?? defaultLocationId;
  return {
    id,
    row: {
      id,
      location_id: locationId,
      contact_id: firstString(order, ["contactId", "customerId"]),
      status: firstString(order, ["status", "paymentStatus"]),
      currency: firstString(order, ["currency"]),
      total_amount: parseNum(order.totalAmount ?? order.total ?? order.amount),
      subtotal_amount: parseNum(order.subtotalAmount ?? order.subtotal),
      tax_amount: parseNum(order.taxAmount ?? order.tax),
      discount_amount: parseNum(order.discountAmount ?? order.discount),
      paid_amount: parseNum(order.paidAmount ?? order.amountPaid),
      created_at_provider: parseIso(order.createdAt),
      updated_at_provider: parseIso(order.updatedAt),
      raw_json: asJsonObject(order),
      synced_at: new Date().toISOString(),
    },
  };
}

function buildInvoiceRow(invoice, defaultLocationId) {
  const id = firstString(invoice, ["id", "invoiceId"]);
  if (id === null) {
    throw new Error("Invoice payload missing id/invoiceId");
  }
  const locationId = firstString(invoice, ["locationId"]) ?? defaultLocationId;
  return {
    id,
    row: {
      id,
      location_id: locationId,
      contact_id: firstString(invoice, ["contactId", "customerId"]),
      order_id: firstString(invoice, ["orderId"]),
      invoice_number: firstString(invoice, ["invoiceNumber", "number"]),
      status: firstString(invoice, ["status", "paymentStatus"]),
      currency: firstString(invoice, ["currency"]),
      total_amount: parseNum(invoice.totalAmount ?? invoice.total ?? invoice.amount),
      subtotal_amount: parseNum(invoice.subtotalAmount ?? invoice.subtotal),
      tax_amount: parseNum(invoice.taxAmount ?? invoice.tax),
      discount_amount: parseNum(invoice.discountAmount ?? invoice.discount),
      due_date: parseIso(invoice.dueDate),
      paid_at: parseIso(invoice.paidAt ?? invoice.paymentDate),
      created_at_provider: parseIso(invoice.createdAt),
      updated_at_provider: parseIso(invoice.updatedAt),
      raw_json: asJsonObject(invoice),
      synced_at: new Date().toISOString(),
    },
  };
}

async function main() {
  const args = parseArgs();
  const maxOrders = args.maxOrders ? parseInt(args.maxOrders, 10) : Number.POSITIVE_INFINITY;
  const maxInvoices = args.maxInvoices ? parseInt(args.maxInvoices, 10) : Number.POSITIVE_INFINITY;
  const throttleMs = throttleMsFromEnv();

  const supabaseUrl = requireEnv("SUPABASE_URL", process.env.SUPABASE_URL);
  const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
  const supabase = createClient(supabaseUrl, supabaseKey);

  const useDbConn =
    args.connectionId.trim() !== "" || args.projectId.trim() !== "";
  let token;
  let locationId;
  if (useDbConn) {
    const encRaw = requireEnv(
      "GHL_CONNECTION_TOKEN_ENCRYPTION_KEY",
      process.env.GHL_CONNECTION_TOKEN_ENCRYPTION_KEY
    );
    const creds = await loadGhlCredentialsFromDb(
      supabase,
      { connectionId: args.connectionId, projectId: args.projectId },
      encRaw
    );
    token = creds.ghlToken;
    locationId = creds.locationId;
  } else {
    token = requireEnv(
      "GHL_PRIVATE_INTEGRATION_TOKEN",
      process.env.GHL_PRIVATE_INTEGRATION_TOKEN
    );
    locationId = requireEnv("GHL_LOCATION_ID", process.env.GHL_LOCATION_ID);
  }
  const version = process.env.GHL_API_VERSION_PAYMENTS ?? "2021-07-28";
  const ordersListPath = process.env.GHL_ORDERS_LIST_PATH ?? "/payments/orders/";
  const orderDetailTpl = process.env.GHL_ORDERS_DETAIL_PATH_TEMPLATE ?? "/payments/orders/{id}";
  const invoicesListPath = process.env.GHL_INVOICES_LIST_PATH ?? "/invoices/";
  const invoiceDetailTpl = process.env.GHL_INVOICES_DETAIL_PATH_TEMPLATE ?? "/invoices/{id}";

  async function ghlGet(pathWithQuery) {
    await sleep(throttleMs);
    const url = `${BASE}${pathWithQuery.startsWith("/") ? "" : "/"}${pathWithQuery}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        Version: version,
      },
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text };
    }
    if (!res.ok) {
      throw new Error(`GHL ${res.status} ${url} - ${JSON.stringify(body).slice(0, 800)}`);
    }
    return body;
  }

  async function syncOrders() {
    let processed = 0;
    let startAfterId = "";
    while (processed < maxOrders) {
      const q = new URLSearchParams({
        locationId,
        limit: String(PAGE_LIMIT),
      });
      if (startAfterId !== "") {
        q.set("startAfterId", startAfterId);
      }
      const listBody = await ghlGet(`${ordersListPath}?${q.toString()}`);
      const rawItems = isRecord(listBody) ? listBody.orders ?? listBody.data : null;
      const batch = Array.isArray(rawItems) ? rawItems : [];
      if (batch.length === 0) {
        break;
      }
      for (const item of batch) {
        if (processed >= maxOrders || !isRecord(item)) {
          continue;
        }
        const orderId = firstString(item, ["id", "orderId"]);
        if (orderId === null) {
          continue;
        }
        const detailPath = orderDetailTpl.replace("{id}", encodeURIComponent(orderId));
        const detail = await ghlGet(detailPath);
        const payload = isRecord(detail) && isRecord(detail.order) ? detail.order : detail;
        if (!isRecord(payload)) {
          continue;
        }
        const built = buildOrderRow(payload, locationId);
        const { error: upErr } = await supabase.from("ghl_orders").upsert(built.row, { onConflict: "id" });
        if (upErr) {
          throw upErr;
        }
        await supabase.from("ghl_order_line_items").delete().eq("order_id", built.id);
        const rawLines = payload.lineItems ?? payload.items;
        const lineItems = Array.isArray(rawLines) ? rawLines : [];
        const rows = [];
        let pos = 0;
        for (const line of lineItems) {
          const mapped = normalizeItem(line, built.id, built.row.location_id, pos);
          if (mapped !== null) {
            rows.push({ order_id: built.id, ...mapped.row });
            pos += 1;
          }
        }
        if (rows.length > 0) {
          const { error: lineErr } = await supabase.from("ghl_order_line_items").insert(rows);
          if (lineErr) {
            throw lineErr;
          }
        }
        processed += 1;
        startAfterId = built.id;
        console.log(`Orders synced: ${processed} (${built.id})`);
      }
      if (batch.length < PAGE_LIMIT) {
        break;
      }
    }
    return processed;
  }

  async function syncInvoices() {
    let processed = 0;
    let startAfterId = "";
    while (processed < maxInvoices) {
      const q = new URLSearchParams({
        locationId,
        limit: String(PAGE_LIMIT),
      });
      if (startAfterId !== "") {
        q.set("startAfterId", startAfterId);
      }
      const listBody = await ghlGet(`${invoicesListPath}?${q.toString()}`);
      const rawItems = isRecord(listBody) ? listBody.invoices ?? listBody.data : null;
      const batch = Array.isArray(rawItems) ? rawItems : [];
      if (batch.length === 0) {
        break;
      }
      for (const item of batch) {
        if (processed >= maxInvoices || !isRecord(item)) {
          continue;
        }
        const invoiceId = firstString(item, ["id", "invoiceId"]);
        if (invoiceId === null) {
          continue;
        }
        const detailPath = invoiceDetailTpl.replace("{id}", encodeURIComponent(invoiceId));
        const detail = await ghlGet(detailPath);
        const payload = isRecord(detail) && isRecord(detail.invoice) ? detail.invoice : detail;
        if (!isRecord(payload)) {
          continue;
        }
        const built = buildInvoiceRow(payload, locationId);
        const { error: upErr } = await supabase.from("ghl_invoices").upsert(built.row, { onConflict: "id" });
        if (upErr) {
          throw upErr;
        }
        await supabase.from("ghl_invoice_line_items").delete().eq("invoice_id", built.id);
        const rawLines = payload.lineItems ?? payload.items;
        const lineItems = Array.isArray(rawLines) ? rawLines : [];
        const rows = [];
        let pos = 0;
        for (const line of lineItems) {
          const mapped = normalizeItem(line, built.id, built.row.location_id, pos);
          if (mapped !== null) {
            rows.push({ invoice_id: built.id, ...mapped.row });
            pos += 1;
          }
        }
        if (rows.length > 0) {
          const { error: lineErr } = await supabase.from("ghl_invoice_line_items").insert(rows);
          if (lineErr) {
            throw lineErr;
          }
        }
        processed += 1;
        startAfterId = built.id;
        console.log(`Invoices synced: ${processed} (${built.id})`);
      }
      if (batch.length < PAGE_LIMIT) {
        break;
      }
    }
    return processed;
  }

  if (args.orderId.trim() !== "") {
    const orderId = args.orderId.trim();
    const detailPath = orderDetailTpl.replace("{id}", encodeURIComponent(orderId));
    const detail = await ghlGet(detailPath);
    const payload = isRecord(detail) && isRecord(detail.order) ? detail.order : detail;
    if (!isRecord(payload)) {
      throw new Error(`Order detail payload is not an object for ${orderId}`);
    }
    const built = buildOrderRow(payload, locationId);
    const { error: upErr } = await supabase.from("ghl_orders").upsert(built.row, { onConflict: "id" });
    if (upErr) {
      throw upErr;
    }
    await supabase.from("ghl_order_line_items").delete().eq("order_id", built.id);
    const rawLines = payload.lineItems ?? payload.items;
    const lineItems = Array.isArray(rawLines) ? rawLines : [];
    const rows = [];
    let pos = 0;
    for (const line of lineItems) {
      const mapped = normalizeItem(line, built.id, built.row.location_id, pos);
      if (mapped !== null) {
        rows.push({ order_id: built.id, ...mapped.row });
        pos += 1;
      }
    }
    if (rows.length > 0) {
      const { error: lineErr } = await supabase.from("ghl_order_line_items").insert(rows);
      if (lineErr) {
        throw lineErr;
      }
    }
    console.log(`Done. Single order synced: ${built.id}`);
    return;
  }

  if (args.invoiceId.trim() !== "") {
    const invoiceId = args.invoiceId.trim();
    const detailPath = invoiceDetailTpl.replace("{id}", encodeURIComponent(invoiceId));
    const detail = await ghlGet(detailPath);
    const payload = isRecord(detail) && isRecord(detail.invoice) ? detail.invoice : detail;
    if (!isRecord(payload)) {
      throw new Error(`Invoice detail payload is not an object for ${invoiceId}`);
    }
    const built = buildInvoiceRow(payload, locationId);
    const { error: upErr } = await supabase.from("ghl_invoices").upsert(built.row, { onConflict: "id" });
    if (upErr) {
      throw upErr;
    }
    await supabase.from("ghl_invoice_line_items").delete().eq("invoice_id", built.id);
    const rawLines = payload.lineItems ?? payload.items;
    const lineItems = Array.isArray(rawLines) ? rawLines : [];
    const rows = [];
    let pos = 0;
    for (const line of lineItems) {
      const mapped = normalizeItem(line, built.id, built.row.location_id, pos);
      if (mapped !== null) {
        rows.push({ invoice_id: built.id, ...mapped.row });
        pos += 1;
      }
    }
    if (rows.length > 0) {
      const { error: lineErr } = await supabase.from("ghl_invoice_line_items").insert(rows);
      if (lineErr) {
        throw lineErr;
      }
    }
    console.log(`Done. Single invoice synced: ${built.id}`);
    return;
  }

  console.log("GHL orders/invoices sync started");
  const ordersCount = await syncOrders();
  const invoicesCount = await syncInvoices();
  console.log(`Done. Orders: ${ordersCount}, Invoices: ${invoicesCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
