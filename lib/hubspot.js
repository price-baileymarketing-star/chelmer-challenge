/* =========================================================================
   Price Bailey game: HubSpot lead capture (shared by both screens)
   -------------------------------------------------------------------------
   Used by the phone controller AND the big screen (when someone plays on
   the tablet without scanning the QR code), so both routes record the same
   details in the same way.

   Portal and form IDs are public by design (they appear in any embed code).
   No secret keys are used. Personal details are held in memory only and
   sent straight to HubSpot: nothing is stored on GitHub or the device.
   ========================================================================= */
(function () {
  "use strict";

  const HUBSPOT = {
    portalId: "145711233",
    formId: "4efe8f63-87e7-4b4c-8ee1-351b8840e6a4",
    // HubSpot's public form submission service. The EU address is tried if the first does not respond.
    endpoints: [
      "https://api.hsforms.com/submissions/v3/integration/submit",
      "https://api-eu1.hsforms.com/submissions/v3/integration/submit"
    ],
    // Internal property names, confirmed in HubSpot (Settings > Properties)
    fields: {
      firstName: "firstname",
      lastName: "lastname",
      email: "email",
      mobile: "mobilephone",
      organisation: "name",          // company record's name property (sent as objectTypeId 0-2)
      gameName: "game_name",
      highScore: "high_score",
      eventName: "event_name",
      consent: "game_form_consent"   // contact property behind the "Yes" checkbox
    },
    // Only if the checkbox is ever switched to HubSpot's built-in marketing consent
    subscriptionTypeId: null,
    gameName: "Chelmer Challenge",
    eventName: "TODO: event name",   // TODO: e.g. "Chelmsford Business Expo 2026"
    submitAtStart: true              // also send details when play starts, so leads are kept even if a game is abandoned
  };

  /* Check the form values. Returns a list of the field keys that need fixing. */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function validate(v) {
    const bad = [];
    if (!v.first) bad.push("first");
    if (!v.last) bad.push("last");
    if (!EMAIL_RE.test(v.email)) bad.push("email");
    if (!v.org) bad.push("org");
    if (v.mobile && !/^[+()\d\s-]{7,20}$/.test(v.mobile)) bad.push("mobile");
    return bad;
  }

  /* ctx: { pageUri, consentText, privacyText, debug(line) } */
  function buildPayload(p, score, ctx) {
    const f = HUBSPOT.fields;
    const fields = [];
    // objectTypeId "0-1" = contact property, "0-2" = company property
    const add = (name, value, objectTypeId = "0-1") => {
      if (name && value !== undefined && value !== null && value !== "") fields.push({ objectTypeId, name, value: String(value) });
    };
    add(f.firstName, p.first);
    add(f.lastName, p.last);
    add(f.email, p.email);
    add(f.organisation, p.org, "0-2");   // Organisation Name maps to the company record
    add(f.mobile, p.mobile);
    add(f.gameName, HUBSPOT.gameName);
    if (!/^TODO/.test(HUBSPOT.eventName)) add(f.eventName, HUBSPOT.eventName);
    if (score !== null && score !== undefined) add(f.highScore, score);
    if (f.consent && p.consent) add(f.consent, "true");   // only sent when ticked; unticked leaves the property empty

    const body = { fields, context: { pageUri: ctx.pageUri, pageName: HUBSPOT.gameName } };
    if (HUBSPOT.subscriptionTypeId) {
      body.legalConsentOptions = { consent: {
        consentToProcess: true,
        text: ctx.privacyText || "",
        communications: [{ value: !!p.consent, subscriptionTypeId: Number(HUBSPOT.subscriptionTypeId), text: ctx.consentText || "" }]
      } };
    }
    return body;
  }

  /* Send details (and the score, when given) to HubSpot. Resolves to { ok: true } or { ok: false, ... }. */
  async function submit(p, score, ctx, attempt = 0) {
    const log = ctx.debug || (() => {});
    const body = JSON.stringify(buildPayload(p, score, ctx));
    for (const base of HUBSPOT.endpoints) {
      const url = `${base}/${HUBSPOT.portalId}/${HUBSPOT.formId}`;
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
        const text = await res.text();
        log(`${res.status} from ${new URL(base).host}: ${text.slice(0, 600)}`);
        if (res.ok) return { ok: true };
        if (res.status === 404) continue;               // try the next address
        return { ok: false, status: res.status, text }; // HubSpot rejected the data (for example a wrong field name)
      } catch (e) {
        log(`network error from ${new URL(base).host}: ${e.message}`);
      }
    }
    // Network trouble: retry a few times, holding the data in memory only
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      return submit(p, score, ctx, attempt + 1);
    }
    return { ok: false, status: 0 };
  }

  window.PBHubSpot = { settings: HUBSPOT, validate, submit };
})();
