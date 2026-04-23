/**
 * NMDABN first-party analytics tracker (vanilla JS, no dependencies).
 *
 * Embed on GoHighLevel funnel pages:
 *
 * <script
 *   src="https://nmdabn-server.vercel.app/tracker.js"
 *   data-site-id="YOUR_PROJECT_UUID"
 *   data-heatmap="false"
 *   async
 * ></script>
 *
 * Attributes:
 * - **data-site-id** (required): Project UUID matching `projects.id` in Supabase.
 * - **data-heatmap** (optional): Set to `"true"` to sample mousemove events (~1 Hz).
 *
 * Runtime API (for GHL hooks / debugging): `window.NMDABN_TRACKER`
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Configuration (script tag attributes + defaults)
  // ---------------------------------------------------------------------------

  var scriptTag = document.currentScript;
  var SITE_ID = scriptTag && scriptTag.getAttribute("data-site-id");
  var HEATMAP = scriptTag && scriptTag.getAttribute("data-heatmap") === "true";
  var ENDPOINT = "https://nmdabn-server.vercel.app/api/track";
  var FLUSH_INTERVAL_MS = 5000;
  var SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  var STORAGE_SID = "nm_sid";
  var STORAGE_LAST = "nm_last";
  var STORAGE_CID = "nm_cid";
  /** localStorage key for the write-ahead optin buffer (survives fast redirects). */
  var STORAGE_PENDING_OPTIN = "nm_pending_optin";
  /** Max age (ms) for a pending optin to be replayed — 5 minutes. */
  var PENDING_OPTIN_TTL_MS = 5 * 60 * 1000;

  if (!SITE_ID || String(SITE_ID).trim() === "") {
    return;
  }

  // ---------------------------------------------------------------------------
  // Session management (localStorage)
  // ---------------------------------------------------------------------------

  /**
   * @returns {string}
   */
  function readStorage(key) {
    try {
      return window.localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* quota / private mode */
    }
  }

  /**
   * @returns {string}
   */
  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return (
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2)
    );
  }

  function ensureSession() {
    var sid = readStorage(STORAGE_SID);
    var lastStr = readStorage(STORAGE_LAST);
    var last = parseInt(lastStr, 10);
    var now = Date.now();
    var expired =
      !lastStr ||
      !Number.isFinite(last) ||
      now - last > SESSION_TIMEOUT_MS;
    if (!sid || expired) {
      sid = randomId();
      writeStorage(STORAGE_SID, sid);
    }
    writeStorage(STORAGE_LAST, String(now));
    return sid;
  }

  var sessionId = ensureSession();

  /**
   * @returns {string}
   */
  function getSessionId() {
    return sessionId;
  }

  /**
   * @returns {string}
   */
  function getContactId() {
    return readStorage(STORAGE_CID);
  }

  /**
   * @param {string} id
   */
  function setContactId(id) {
    if (typeof id === "string" && id.trim() !== "") {
      writeStorage(STORAGE_CID, id.trim());
    }
  }

  // ---------------------------------------------------------------------------
  // Landing URL attribution (UTM + fbclid), captured once per page load
  // ---------------------------------------------------------------------------

  var searchParams = new URLSearchParams(window.location.search);
  var pageUtms = {
    utm_source: searchParams.get("utm_source") || "",
    utm_medium: searchParams.get("utm_medium") || "",
    utm_campaign: searchParams.get("utm_campaign") || "",
    utm_content: searchParams.get("utm_content") || "",
    utm_term: searchParams.get("utm_term") || "",
    fbclid: searchParams.get("fbclid") || "",
  };

  // ---------------------------------------------------------------------------
  // Event queue + network flush
  // ---------------------------------------------------------------------------

  /** @type {Record<string, unknown>[]} */
  var queue = [];

  /**
   * Sends JSON to the collector using fetch with credentials omitted.
   *
   * navigator.sendBeacon forces credentials mode "include" which is
   * incompatible with a wildcard CORS policy. fetch + credentials:"omit" +
   * keepalive:true provides the same "survives page unload" guarantee without
   * triggering the CORS credentials conflict.
   *
   * @param {string} jsonBody
   */
  function sendPayload(jsonBody) {
    fetch(ENDPOINT, {
      method: "POST",
      body: jsonBody,
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      keepalive: true,
    }).catch(function () {
      /* ignore network errors */
    });
  }

  /**
   * Persists session activity timestamp and transmits queued events.
   */
  function flush() {
    writeStorage(STORAGE_LAST, String(Date.now()));
    if (queue.length === 0) return;
    var batch = queue.slice();
    queue.length = 0;
    var payload = JSON.stringify({
      site_id: SITE_ID,
      session_id: getSessionId(),
      events: batch,
    });
    sendPayload(payload);
  }

  window.setInterval(flush, FLUSH_INTERVAL_MS);
  window.addEventListener("beforeunload", flush);
  window.addEventListener("pagehide", flush);

  // ---------------------------------------------------------------------------
  // Write-ahead optin buffer — replay any pending optin from previous page
  // ---------------------------------------------------------------------------
  //
  // GHL funnels redirect to a thank-you page immediately after form submit.
  // Even with keepalive:true the browser may not finish the fetch before the
  // navigation tears down the page context on some mobile browsers / WebViews.
  //
  // Strategy: on optin detection, write the batch to localStorage first
  // (synchronous — survives navigation instantly), then attempt the keepalive
  // fetch as usual. On the NEXT page load that includes this tracker, read the
  // stored batch and replay it, then clear the key so it is only sent once.

  /**
   * Saves an optin batch payload string to localStorage for cross-page replay.
   *
   * @param {string} jsonBody — the same JSON string that will be sent via fetch
   */
  function savePendingOptin(jsonBody) {
    try {
      var entry = JSON.stringify({ ts: Date.now(), body: jsonBody });
      window.localStorage.setItem(STORAGE_PENDING_OPTIN, entry);
    } catch {
      /* quota / private mode */
    }
  }

  /**
   * Checks localStorage for a pending optin saved by a previous page and sends
   * it if it is still within the TTL window. Called once at page load so the
   * thank-you page (or any next funnel step) completes the delivery.
   */
  function replayPendingOptin() {
    try {
      var raw = window.localStorage.getItem(STORAGE_PENDING_OPTIN);
      if (!raw) return;
      // Clear immediately — even if the send fails we don't want to retry
      // indefinitely and risk double-counting a real submission.
      window.localStorage.removeItem(STORAGE_PENDING_OPTIN);
      var entry = JSON.parse(raw);
      if (
        entry === null ||
        typeof entry !== "object" ||
        typeof entry.body !== "string" ||
        typeof entry.ts !== "number" ||
        Date.now() - entry.ts > PENDING_OPTIN_TTL_MS
      ) {
        return;
      }
      sendPayload(entry.body);
    } catch {
      /* corrupt entry — ignore */
    }
  }

  // Replay on this page load before registering any new listeners.
  replayPendingOptin();

  /**
   * Adds key to `out` only when value should be serialized (truthy strings,
   * non-null objects, or numeric 0 for coordinates / scroll_depth).
   *
   * @param {Record<string, unknown>} out
   * @param {string} key
   * @param {unknown} value
   */
  function putTruthy(out, key, value) {
    if (value === undefined || value === null) return;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return;
      out[key] = value;
      return;
    }
    if (typeof value === "string") {
      if (value.trim() !== "") out[key] = value;
      return;
    }
    if (typeof value === "boolean" && value) out[key] = value;
  }

  /**
   * @param {string} eventType
   * @param {Record<string, unknown>} extra
   * @returns {Record<string, unknown>}
   */
  function buildEvent(eventType, extra) {
    /** @type {Record<string, unknown>} */
    var ev = {
      event_type: eventType,
      url: window.location.href,
      referrer: document.referrer || "",
      occurred_at: new Date().toISOString(),
    };
    putTruthy(ev, "ghl_contact_id", getContactId());
    putTruthy(ev, "utm_source", pageUtms.utm_source);
    putTruthy(ev, "utm_medium", pageUtms.utm_medium);
    putTruthy(ev, "utm_campaign", pageUtms.utm_campaign);
    putTruthy(ev, "utm_content", pageUtms.utm_content);
    putTruthy(ev, "utm_term", pageUtms.utm_term);
    putTruthy(ev, "fbclid", pageUtms.fbclid);
    var k;
    for (k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) {
        putTruthy(ev, k, extra[k]);
      }
    }
    /** @type {Record<string, unknown>} */
    var trimmed = {};
    var key;
    for (key in ev) {
      if (!Object.prototype.hasOwnProperty.call(ev, key)) continue;
      var v = ev[key];
      if (v === undefined || v === null) continue;
      if (typeof v === "string" && v.trim() === "") continue;
      trimmed[key] = v;
    }
    return trimmed;
  }

  /**
   * @param {Record<string, unknown>} eventObj
   */
  function push(eventObj) {
    queue.push(eventObj);
  }

  // ---------------------------------------------------------------------------
  // Pageview (once)
  // ---------------------------------------------------------------------------

  push(buildEvent("pageview", {}));

  // ---------------------------------------------------------------------------
  // Click tracking (capture phase)
  // ---------------------------------------------------------------------------

  document.addEventListener(
    "click",
    function (e) {
      var t = e.target;
      if (!t || typeof t !== "object") return;
      var el = /** @type {HTMLElement} */ (t);
      var w = Math.max(1, window.innerWidth);
      var h = Math.max(1, window.innerHeight);
      var x = Math.round((e.clientX / w) * 100);
      var y = Math.round((e.clientY / h) * 100);
      var tag = el.tagName ? String(el.tagName).toUpperCase() : "";
      var text = "";
      if (typeof el.innerText === "string") text = el.innerText;
      else if (
        /** @type {HTMLInputElement} */ (el).value !== undefined &&
        typeof /** @type {HTMLInputElement} */ (el).value === "string"
      ) {
        text = /** @type {HTMLInputElement} */ (el).value;
      }
      text = text.slice(0, 100);
      push(
        buildEvent("click", {
          x: x,
          y: y,
          element_tag: tag,
          element_text: text,
        })
      );
    },
    true
  );

  // ---------------------------------------------------------------------------
  // Scroll depth (max), sent once on unload via beacon (not queued)
  // ---------------------------------------------------------------------------

  var maxScroll = 0;

  window.addEventListener(
    "scroll",
    function () {
      var docHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      var viewH = window.innerHeight;
      var denom = Math.max(1, docHeight - viewH);
      var pct = Math.min(
        100,
        Math.round((window.scrollY / denom) * 100)
      );
      if (pct > maxScroll) maxScroll = pct;
    },
    { passive: true }
  );

  window.addEventListener("beforeunload", function () {
    var json = JSON.stringify({
      site_id: SITE_ID,
      session_id: getSessionId(),
      events: [
        buildEvent("scroll_depth", { scroll_depth: maxScroll }),
      ],
    });
    sendPayload(json);
  });

  // ---------------------------------------------------------------------------
  // Opt-in / form hooks (native submit + GHL custom event)
  // ---------------------------------------------------------------------------

  /**
   * Epoch ms of the last optin push. Guards against double-fires when both a
   * native `submit` and `hl-form-submitted` fire for the same form submission,
   * or when the event propagates through both document and window listeners.
   * @type {number}
   */
  var lastOptInAt = 0;

  /**
   * @param {Event} ev
   */
  function handleOptIn(ev) {
    var now = Date.now();
    // Deduplicate: ignore a second trigger within 500 ms of the previous one.
    if (now - lastOptInAt < 500) return;
    lastOptInAt = now;

    var cid = "";
    if (
      ev !== null &&
      typeof ev === "object" &&
      "detail" in ev &&
      ev.detail !== null &&
      typeof ev.detail === "object"
    ) {
      var d = /** @type {{ contact_id?: unknown; contactId?: unknown }} */ (
        ev.detail
      );
      var a = d.contact_id;
      var b = d.contactId;
      if (typeof a === "string" && a.trim() !== "") cid = a.trim();
      else if (typeof b === "string" && b.trim() !== "") cid = b.trim();
    }
    if (cid !== "") {
      setContactId(cid);
      push(
        buildEvent("identify", {
          ghl_contact_id: cid,
        })
      );
    }
    push(buildEvent("optin", {}));

    // Build the payload that flush() would produce, save it to localStorage
    // BEFORE attempting the network send. If the browser navigates away before
    // the keepalive fetch completes, the next page that loads this tracker will
    // call replayPendingOptin() and deliver it.
    var optinBatch = queue.slice();
    var optinPayload = JSON.stringify({
      site_id: SITE_ID,
      session_id: getSessionId(),
      events: optinBatch,
    });
    savePendingOptin(optinPayload);

    // Flush immediately instead of waiting for the 5-second interval.
    // GHL funnels redirect to a thank-you page within milliseconds of submit;
    // some mobile browsers drop keepalive fetch requests on navigation, so
    // getting the POST out before the redirect is the only reliable guarantee.
    flush();

    // Clear the pending-optin entry only after flush() has sent it. If
    // sendPayload succeeds the localStorage entry is redundant; remove it so
    // the replay on the next page is a no-op.
    try {
      window.localStorage.removeItem(STORAGE_PENDING_OPTIN);
    } catch {
      /* ignore */
    }
  }

  // Capture phase: GHL's own JS calls stopPropagation() on form elements,
  // which blocks bubble-phase listeners on document from seeing the submit.
  document.addEventListener("submit", handleOptIn, true);

  // Listen on both document and window for hl-form-submitted.
  // GHL dispatches the event inconsistently across funnel page types —
  // sometimes on the form element (bubbles to document), sometimes directly
  // on window (never reaches document). Both listeners + the 500ms dedup
  // above ensure exactly one optin is recorded regardless of dispatch target.
  document.addEventListener("hl-form-submitted", handleOptIn);
  window.addEventListener("hl-form-submitted", handleOptIn);

  // ---------------------------------------------------------------------------
  // Optional heatmap sampling (mousemove)
  // ---------------------------------------------------------------------------

  var lastMoveTime = 0;

  if (HEATMAP) {
    document.addEventListener(
      "mousemove",
      function (e) {
        var now = Date.now();
        if (now - lastMoveTime <= 1000) return;
        lastMoveTime = now;
        var w = Math.max(1, window.innerWidth);
        var h = Math.max(1, window.innerHeight);
        var x = Math.round((e.clientX / w) * 100);
        var y = Math.round((e.clientY / h) * 100);
        push(buildEvent("mousemove", { x: x, y: y }));
      },
      { passive: true }
    );
  }

  // ---------------------------------------------------------------------------
  // Public surface (session + contact helpers for embedders / GHL)
  // ---------------------------------------------------------------------------

  window.NMDABN_TRACKER = {
    getSessionId: getSessionId,
    getContactId: getContactId,
    setContactId: setContactId,
    flush: flush,
  };
})();
