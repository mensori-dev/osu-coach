'use strict';

const WebSocket = require('ws');

const RECONNECT_MS = 3000;

class TosuBridge {
  constructor({ port = 24050, onUpdate, onStatus }) {
    this.port = port;
    this.onUpdate = onUpdate;
    this.onStatus = onStatus;
    this.state = null;
    this.hitErrors = [];
    this.keys = null;
    this.connected = false;
    this.timer = null;
    this.closed = false;
  }

  start() {
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    clearTimeout(this.timer);
    try {
      this.ws?.terminate();
      this.precise?.terminate();
    } catch {
      /* ignore */
    }
  }

  connect() {
    if (this.closed) return;
    const base = `ws://127.0.0.1:${this.port}`;

    try {
      this.ws = new WebSocket(`${base}/websocket/v2`);
      this.precise = new WebSocket(`${base}/websocket/v2/precise`);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.connected = true;
      this.onStatus?.({ connected: true, port: this.port });
    });

    this.ws.on('message', (raw) => {
      try {
        this.state = JSON.parse(raw.toString());
        this.onUpdate?.();
      } catch {
        /* ignore malformed frame */
      }
    });

    this.precise.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        this.hitErrors = Array.isArray(data.hitErrors) ? data.hitErrors : [];
        this.keys = data.keys || null;
        this.onUpdate?.();
      } catch {
        /* ignore malformed frame */
      }
    });

    const drop = () => {
      if (this.connected) {
        this.connected = false;
        this.state = null;
        this.hitErrors = [];
        this.onStatus?.({ connected: false, port: this.port });
      }
      this.scheduleReconnect();
    };

    this.ws.on('close', drop);
    this.ws.on('error', drop);
    this.precise.on('error', () => {});
  }

  scheduleReconnect() {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), RECONNECT_MS);
  }
}

module.exports = { TosuBridge };
