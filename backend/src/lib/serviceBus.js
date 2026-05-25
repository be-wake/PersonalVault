'use strict';

/**
 * Publishes revocation/expiry events.
 *
 * Uses Azure Service Bus in production; falls back to an in-process EventEmitter
 * when SERVICE_BUS_CONNECTION_STRING is not set.
 */

const { EventEmitter } = require('events');
const logger = require('./logger');

const log   = logger.child({ module: 'service-bus' });
const TOPIC = process.env.SERVICE_BUS_TOPIC_REVOCATION || 'pdv-revocation-events';

let impl;

function memoryImpl() {
  const bus = new EventEmitter();
  return {
    name: 'memory',
    async publish(eventType, body) {
      bus.emit(eventType, body);
    },
    on(eventType, handler)  { bus.on(eventType, handler); },
    async close() { bus.removeAllListeners(); },
  };
}

function sbImpl(conn) {
  const { ServiceBusClient } = require('@azure/service-bus');
  const client = new ServiceBusClient(conn);
  const sender = client.createSender(TOPIC);
  log.info({ topic: TOPIC }, 'Service Bus sender ready');
  return {
    name: 'azure-service-bus',
    async publish(eventType, body) {
      await sender.sendMessages({ body, applicationProperties: { eventType } });
    },
    on() {
      // Cross-process subscriptions need a separate Subscription receiver — not supported in-process.
      log.warn('In-process .on() not supported with Azure Service Bus — use a Subscription receiver');
    },
    async close() {
      await sender.close();
      await client.close();
    },
  };
}

function get() {
  if (impl) return impl;
  const conn = process.env.SERVICE_BUS_CONNECTION_STRING;
  if (conn) {
    impl = sbImpl(conn);
  } else {
    impl = memoryImpl();
    log.warn('SERVICE_BUS_CONNECTION_STRING not set — using in-memory event bus');
  }
  return impl;
}

module.exports = {
  publish: (eventType, body) => get().publish(eventType, body),
  on:      (eventType, handler) => get().on(eventType, handler),
  close:   () => get().close(),
  implName: () => get().name,
};
