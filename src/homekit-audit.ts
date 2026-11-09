import type { Characteristic, CharacteristicChange, Logger, PlatformAccessory, Service } from 'homebridge';
import { isIP } from 'node:net';
import { createHmac, randomBytes } from 'node:crypto';
import type { Buffer } from 'node:buffer';
import { redactDiagnosticText } from './blink-api/redaction';

export interface HomeKitAuditEvent {
  direction: 'HomeKit -> bridge' | 'bridge -> HomeKit' | 'bridge -> HAP' | 'Blink -> bridge';
  event: string;
  service?: string;
  characteristic?: string;
  value?: unknown;
  outcome?: string;
  status?: number;
  width?: number;
  height?: number;
  bytes?: number;
  audio?: boolean;
  talkback?: boolean;
  controllerPairing?: string;
  controllerConnection?: string;
}

const REDACTED = '<redacted>';
let originKey: Buffer | undefined;
let connectionSequence = 0;
const connectionAliases = new WeakMap<object, string>();
const EVENT_CHARACTERISTICS = new Set([
  '00000073-0000-1000-8000-0026BB765291', // ProgrammableSwitchEvent
  '00000126-0000-1000-8000-0026BB765291', // ButtonEvent
]);

function originAlias(domain: 'pairing' | 'connection', value: string): string {
  // Initialize lazily inside controllerOrigin's failure isolation. Nothing is
  // persisted: aliases are deliberately different after a process restart.
  originKey ??= randomBytes(32);
  return `${domain}-${createHmac('sha256', originKey).update(`homekit-audit/${domain}\0`).update(value).digest('hex').slice(0, 32)}`;
}

function controllerOrigin(connection: unknown): Pick<HomeKitAuditEvent, 'controllerPairing' | 'controllerConnection'> {
  if (connection === undefined) return {};
  const origin = { controllerPairing: 'unknown', controllerConnection: 'unknown' };
  if (!connection || (typeof connection !== 'object' && typeof connection !== 'function')) return origin;
  try {
    let alias = connectionAliases.get(connection);
    if (!alias) {
      alias = originAlias('connection', String(++connectionSequence));
      connectionAliases.set(connection, alias);
    }
    origin.controllerConnection = alias;
  } catch {
    // Missing randomness or inaccessible metadata must not change HAP behavior.
  }
  try {
    const peer = connection as { isAuthenticated?: () => unknown; username?: unknown };
    const authenticated = peer.isAuthenticated;
    if (typeof authenticated === 'function' && authenticated.call(connection) === true) {
      const username = peer.username;
      if (typeof username === 'string' && username.length <= 256 && username.trim().length > 0
        && !/[\p{Cc}\u2028\u2029]/u.test(username)) {
        origin.controllerPairing = originAlias('pairing', username);
      }
    }
  } catch {
    // The only inspected metadata is authenticated pairing username; never
    // inspect sessionID, network endpoints, keys, or arbitrary peer properties.
  }
  return origin;
}

function safeLabel(value: string, accessory: PlatformAccessory): string {
  const device = accessory.context.device as Record<string, unknown> | undefined;
  // Remove whole URLs before their host can be replaced with a redaction marker.
  // Address masking must precede device IDs, which can also be address segments.
  let label = redactDiagnosticText(value).replace(/[a-f\d:.]+(?:%[\w.-]+)?/gi, token => {
    const address = token.replace(/\.+$/, '');
    return isIP(address) ? `${REDACTED}${token.slice(address.length)}` : token;
  });
  // A port suffix makes an IPv4 endpoint fail isIP as a whole; retain only the
  // non-address punctuation/port, while still validating the address itself.
  label = label.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, token => isIP(token) ? REDACTED : token);
  for (const identifier of [device?.serial, device?.id, device?.network_id, accessory.UUID]) {
    if (typeof identifier === 'string' && identifier.length > 0) {
      label = label.split(identifier).join(REDACTED);
    } else if (typeof identifier === 'number') {
      label = label.replace(new RegExp(`\\b${identifier}\\b`, 'g'), REDACTED);
    }
  }
  return redactDiagnosticText(label).replace(/[\p{Cc}\u2028\u2029]/gu, ' ').slice(0, 160);
}

function safeValue(value: unknown): boolean | number | string | null {
  if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
    return value;
  }
  return REDACTED;
}

/** One bounded INFO record; audit failures must never interrupt a HAP operation. */
export function logHomeKitEvent(log: Pick<Logger, 'info'>, accessory: PlatformAccessory, event: HomeKitAuditEvent): void {
  try {
    const deviceName = accessory.context.device?.name;
    const record: Record<string, unknown> = {
      datetime: new Date().toISOString(),
      accessory: safeLabel(typeof deviceName === 'string' ? deviceName : accessory.displayName, accessory),
      direction: event.direction,
      event: safeLabel(event.event, accessory),
    };
    for (const key of ['service', 'characteristic', 'outcome'] as const) {
      if (typeof event[key] === 'string') record[key] = safeLabel(event[key], accessory);
    }
    if (Object.hasOwn(event, 'value')) record.value = safeValue(event.value);
    for (const key of ['status', 'width', 'height', 'bytes'] as const) {
      if (typeof event[key] === 'number' && Number.isFinite(event[key])) record[key] = event[key];
    }
    for (const key of ['audio', 'talkback'] as const) {
      if (typeof event[key] === 'boolean') record[key] = event[key];
    }
    for (const [key, pattern] of [
      ['controllerPairing', /^(?:pairing-[0-9a-f]{32}|unknown)$/],
      ['controllerConnection', /^(?:connection-[0-9a-f]{32}|unknown)$/],
    ] as const) {
      if (typeof event[key] === 'string' && pattern.test(event[key])) record[key] = event[key];
    }
    log.info(`[HomeKit audit] ${JSON.stringify(record)}`);
  } catch {
    // Logging is observational: preserve the original HomeKit result/error.
  }
}

function errorStatus(error: unknown): number | undefined {
  try {
    const status = typeof error === 'number' ? error : (error as { hapStatus?: unknown } | null)?.hapStatus;
    return typeof status === 'number' && Number.isFinite(status) ? status : undefined;
  } catch {
    return undefined;
  }
}

type Cleanup = () => void;
type Method = (this: unknown, ...args: unknown[]) => unknown;

/**
 * The installed HAP 0.14 request entry points are private. Keep that dependency
 * isolated here: public change events omit unchanged reads, errors and write
 * responses. Only plugin-owned instances are wrapped, never HAP prototypes.
 */
export class HomeKitAudit {
  private readonly accessories = new Map<PlatformAccessory, { rescan: () => void; dispose: Cleanup }>();
  private warnedIncomplete = false;

  constructor(private readonly log: Pick<Logger, 'info' | 'warn'>) {}

  observe(accessory: PlatformAccessory): void {
    const existing = this.accessories.get(accessory);
    if (existing) {
      existing.rescan();
      return;
    }
    const services = new Map<Service, { dispose: Cleanup }>();
    const characteristics = new Map<Characteristic, Cleanup>();
    const accessoryCleanup: Cleanup[] = [];
    const rescan = () => {
      try {
        const currentServices = new Set(accessory.services);
        const currentCharacteristics = new Set<Characteristic>();
        for (const service of currentServices) {
          if (!Array.isArray(service.characteristics) || typeof service.on !== 'function') {
            this.warnIncomplete();
            continue;
          }
          if (!services.has(service)) {
            service.on('service-configurationChange', rescan);
            services.set(service, { dispose: () => service.removeListener('service-configurationChange', rescan) });
          }
          for (const characteristic of service.characteristics) {
            currentCharacteristics.add(characteristic);
            if (!characteristics.has(characteristic)) {
              characteristics.set(characteristic, this.observeCharacteristic(accessory, service, characteristic));
            }
          }
        }
        for (const [characteristic, dispose] of characteristics) {
          if (!currentCharacteristics.has(characteristic)) {
            dispose();
            characteristics.delete(characteristic);
          }
        }
        for (const [service, observer] of services) {
          if (!currentServices.has(service)) {
            observer.dispose();
            services.delete(service);
          }
        }
      } catch {
        this.warnIncomplete();
      }
    };
    for (const method of ['addService', 'removeService', 'configureController', 'removeController']) {
      const restore = this.wrapMethod(accessory, method, original => function (...args) {
        try {
          return Reflect.apply(original, this, args);
        } finally {
          rescan();
        }
      });
      if (restore) accessoryCleanup.push(restore);
    }
    this.accessories.set(accessory, {
      rescan,
      dispose: () => {
        for (const dispose of characteristics.values()) dispose();
        for (const observer of services.values()) observer.dispose();
        accessoryCleanup.forEach(dispose => dispose());
      },
    });
    rescan();
  }

  remove(accessory: PlatformAccessory): void {
    this.accessories.get(accessory)?.dispose();
    this.accessories.delete(accessory);
  }

  dispose(): void {
    for (const accessory of this.accessories.keys()) this.remove(accessory);
  }

  private warnIncomplete(): void {
    if (this.warnedIncomplete) return;
    this.warnedIncomplete = true;
    try {
      this.log.warn('HomeKit audit coverage is incomplete: installed HAP request or lifecycle hooks are unavailable.');
    } catch {
      // A logging failure must not interrupt accessory registration.
    }
  }

  private wrapMethod(target: object, name: string, makeWrapper: (original: Method) => Method): Cleanup | undefined {
    const methods = target as Record<string, unknown>;
    const original = methods[name];
    if (typeof original !== 'function') {
      this.warnIncomplete();
      return;
    }
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    const wrapper = makeWrapper(original as Method);
    try {
      Object.defineProperty(target, name, { configurable: true, writable: true, value: wrapper });
    } catch {
      this.warnIncomplete();
      return;
    }
    return () => {
      if (methods[name] !== wrapper) return;
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else delete methods[name];
    };
  }

  private observeCharacteristic(accessory: PlatformAccessory, service: Service, characteristic: Characteristic): Cleanup {
    const cleanup: Cleanup[] = [];
    const valueForAudit = (value: unknown) => ['bool', 'int', 'float', 'uint8', 'uint16', 'uint32', 'uint64']
      .includes(characteristic.props.format) ? value : REDACTED;
    const write = (event: HomeKitAuditEvent) => logHomeKitEvent(this.log, accessory, {
      service: service.displayName,
      characteristic: characteristic.displayName,
      ...event,
    });
    for (const [method, operation, connectionIndex] of [
      ['handleGetRequest', 'read', 0],
      ['handleSetRequest', 'write', 1],
    ] as const) {
      const restore = this.wrapMethod(characteristic, method, original => function (...args) {
        const homeKit = args[connectionIndex] !== undefined;
        const origin = controllerOrigin(args[connectionIndex]);
        const direction = homeKit ? 'HomeKit -> bridge' : 'bridge -> HAP';
        const responseDirection = homeKit ? 'bridge -> HomeKit' : 'bridge -> HAP';
        const request: HomeKitAuditEvent = { ...origin, direction, event: `Characteristic ${operation}`, outcome: 'requested' };
        if (operation === 'write') request.value = valueForAudit(args[0]);
        write(request);
        const succeeded = (result: unknown) => {
          const response: HomeKitAuditEvent = {
            ...origin,
            direction: responseDirection, event: `Characteristic ${operation}`, outcome: 'succeeded', status: 0,
          };
          if (operation === 'read' || result !== undefined) response.value = valueForAudit(result);
          write(response);
          return result;
        };
        const failed = (error: unknown): never => {
          write({ ...origin, direction: responseDirection, event: `Characteristic ${operation}`, outcome: 'failed', status: errorStatus(error) });
          throw error;
        };
        try {
          const result = Reflect.apply(original, this, args);
          return result instanceof Promise ? result.then(succeeded, failed) : succeeded(result);
        } catch (error) {
          return failed(error);
        }
      });
      if (restore) cleanup.push(restore);
    }
    const change = (event: CharacteristicChange) => {
      if (event.context && typeof event.context === 'object' && event.context.omitEventUpdate) return;
      if (event.reason !== 'event' && event.oldValue === event.newValue && !EVENT_CHARACTERISTICS.has(characteristic.UUID)) return;
      write({ ...controllerOrigin(event.originator), direction: 'bridge -> HomeKit', event: event.reason === 'event' ? 'Characteristic event' : 'Characteristic update',
        outcome: 'submitted to HAP', value: valueForAudit(event.newValue) });
    };
    const subscribe = () => write({ direction: 'HomeKit -> bridge', event: 'Notifications subscribed', outcome: 'active' });
    const unsubscribe = () => write({ direction: 'HomeKit -> bridge', event: 'Notifications unsubscribed', outcome: 'inactive' });
    characteristic.on('change', change);
    characteristic.on('subscribe', subscribe);
    characteristic.on('unsubscribe', unsubscribe);
    cleanup.push(() => {
      characteristic.removeListener('change', change);
      characteristic.removeListener('subscribe', subscribe);
      characteristic.removeListener('unsubscribe', unsubscribe);
    });
    return () => cleanup.forEach(dispose => dispose());
  }
}
