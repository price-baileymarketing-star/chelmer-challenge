/* =========================================================================
   Growth Pilot: display <-> controller link (v2, MQTT relay)
   -------------------------------------------------------------------------
   v1 used PeerJS (a direct phone-to-screen link). Mobile and company
   networks often block direct links, so v2 relays every message through
   public MQTT brokers over secure WebSockets instead.

   Two transports run side by side:
   1. MQTT over WSS. Used between two devices (big screen + phone).
      Messages go to two free public brokers at once for redundancy.
      Duplicates are harmless because every message is idempotent.
   2. BroadcastChannel. Used when display and controller are open as two
      tabs in the SAME browser. Handy for desk testing with no phone.

   Messages are plain JSON objects with a "t" (type) field.
   Liveness: both sides send a {t:"beat"} every 2 seconds. If nothing is
   heard for 6 seconds the other side is treated as gone.

   NOTE: public brokers are shared and have no uptime guarantee. Fine for
   testing. For the event, swap BROKERS for a private broker or Firebase.
   ========================================================================= */
(function () {
  "use strict";

  const TOPIC_ROOT = "pricebailey/growthpilot/"; // change per game to keep rooms separate
  const BROKERS = [
    "wss://broker.emqx.io:8084/mqtt",
    "wss://broker.hivemq.com:8884/mqtt"
  ];
  const BEAT_MS = 2000;
  const TIMEOUT_MS = 6000;

  // Optional override for testing: ?broker=ws://localhost:9001
  const override = new URLSearchParams(location.search).get("broker");
  const brokerList = override ? [override] : BROKERS;

  /* Load the bundled MQTT library from the same folder as this file */
  const libBase = (document.currentScript && document.currentScript.src || "").replace(/link\.js(\?.*)?$/, "");
  let mqttReady = null;
  function loadMqtt() {
    if (window.mqtt) return Promise.resolve();
    if (!mqttReady) mqttReady = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = libBase + "mqtt.min.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    return mqttReady;
  }

  /* Random 4-character room code, avoiding look-alike characters */
  function makeCode() {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let c = "";
    for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
  }

  /* ---------- Shared relay: connects to every broker, publishes to all ---------- */
  function createRelay(subTopic, pubTopic, onMsg, onBrokerCount) {
    const clients = [];
    let alive = true;
    function countUp() { return clients.filter((c) => c.connected).length; }

    loadMqtt().then(() => {
      if (!alive) return;
      brokerList.forEach((url) => {
        const c = window.mqtt.connect(url, {
          clientId: "pbgp_" + Math.random().toString(16).slice(2, 10),
          keepalive: 30, reconnectPeriod: 2000, connectTimeout: 8000, clean: true
        });
        c.on("connect", () => { c.subscribe(subTopic, { qos: 0 }); onBrokerCount(countUp()); });
        c.on("close", () => onBrokerCount(countUp()));
        c.on("error", (e) => console.warn("MQTT error", url, e && e.message));
        c.on("message", (topic, payload) => {
          try { onMsg(JSON.parse(payload.toString())); } catch (e) {}
        });
        clients.push(c);
      });
    }).catch(() => onBrokerCount(0));

    return {
      send(msg) {
        const body = JSON.stringify(msg);
        clients.forEach((c) => { if (c.connected) c.publish(pubTopic, body, { qos: 0 }); });
      },
      connectedCount: countUp,
      destroy() { alive = false; clients.forEach((c) => { try { c.end(true); } catch (e) {} }); }
    };
  }

  /* ---------- DISPLAY (host) side ---------- */
  function createHost(code, handlers) {
    const room = TOPIC_ROOT + code;
    const bc = ("BroadcastChannel" in window) ? new BroadcastChannel("pb-growthpilot-" + code) : null;
    let live = false;        // a controller is currently talking to us
    let lastSeen = 0;
    let brokers = 0;
    let everTried = false;

    function status() {
      let s;
      if (live) s = "connected";
      else if (brokers > 0) s = "ready";
      else if (everTried) s = "offline";
      else return; // still starting up: leave the page's "Connecting…" text
      handlers.onStatus && handlers.onStatus(s);
    }

    function fromController(msg) {
      if (!msg || !msg.t) return;
      lastSeen = Date.now();
      if (!live) { live = true; status(); handlers.onConnect && handlers.onConnect(); }
      if (msg.t !== "beat") handlers.onMessage(msg);
    }

    const relay = createRelay(room + "/c", room + "/d", fromController, (n) => { brokers = n; status(); });
    setTimeout(() => { everTried = true; status(); }, 10000); // after 10s with no broker, say offline

    if (bc) bc.onmessage = (e) => { if (e.data && e.data.from === "controller") fromController(e.data.msg); };

    const beat = setInterval(() => {
      relay.send({ t: "beat" });
      if (live && Date.now() - lastSeen > TIMEOUT_MS) {
        live = false; status(); handlers.onDisconnect && handlers.onDisconnect();
      }
    }, BEAT_MS);

    status();
    return {
      send(msg) {
        relay.send(msg);
        if (bc) bc.postMessage({ from: "display", msg });
      },
      destroy() { clearInterval(beat); relay.destroy(); if (bc) bc.close(); }
    };
  }

  /* ---------- CONTROLLER side ---------- */
  function createController(code, handlers) {
    const room = TOPIC_ROOT + code;
    const bc = ("BroadcastChannel" in window) ? new BroadcastChannel("pb-growthpilot-" + code) : null;
    let live = false;        // the display is currently talking to us
    let lastSeen = 0;
    let brokers = 0;
    let brokerSince = 0;     // when we first reached a broker
    const started = Date.now();

    function status() {
      let s;
      if (live) s = "connected";
      else if (brokers > 0) s = (Date.now() - brokerSince > TIMEOUT_MS) ? "nogame" : "connecting";
      else s = (Date.now() - started > 10000) ? "offline" : "connecting";
      handlers.onStatus && handlers.onStatus(s);
    }

    function fromDisplay(msg) {
      if (!msg || !msg.t) return;
      lastSeen = Date.now();
      if (!live) { live = true; status(); }
      if (msg.t !== "beat") handlers.onMessage(msg);
    }

    const relay = createRelay(room + "/d", room + "/c", fromDisplay, (n) => {
      if (n > 0 && brokers === 0) { brokerSince = Date.now(); relay.send({ t: "hello" }); }
      brokers = n; status();
    });

    if (bc) {
      bc.onmessage = (e) => { if (e.data && e.data.from === "display") fromDisplay(e.data.msg); };
      bc.postMessage({ from: "controller", msg: { t: "hello" } });
    }

    // Heartbeat, plus keep saying hello until the display answers
    setInterval(() => {
      relay.send({ t: live ? "beat" : "hello" });
      if (bc && !live) bc.postMessage({ from: "controller", msg: { t: "hello" } });
      if (live && Date.now() - lastSeen > TIMEOUT_MS) live = false;
      status();
    }, BEAT_MS);

    status();
    return {
      send(msg) {
        relay.send(msg);
        if (bc) bc.postMessage({ from: "controller", msg });
      }
    };
  }

  window.GPLink = { makeCode, createHost, createController };
})();
