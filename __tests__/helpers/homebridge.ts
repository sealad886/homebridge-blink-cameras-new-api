// Create ProgrammableSwitchEvent with both a toString for map key and static values
const ProgrammableSwitchEvent = Object.assign(
  () => 'ProgrammableSwitchEvent',
  { SINGLE_PRESS: 0, DOUBLE_PRESS: 1, LONG_PRESS: 2, toString: () => 'ProgrammableSwitchEvent' }
);

export const createHap = () => ({
  Service: {
    AccessoryInformation: 'AccessoryInformation',
    Switch: 'Switch',
    SecuritySystem: 'SecuritySystem',
    MotionSensor: 'MotionSensor',
    Doorbell: 'Doorbell',
  },
  Characteristic: {
    Manufacturer: 'Manufacturer',
    Model: 'Model',
    SerialNumber: 'SerialNumber',
    On: 'On',
    SecuritySystemCurrentState: {
      STAY_ARM: 0,
      AWAY_ARM: 1,
      NIGHT_ARM: 2,
      DISARMED: 3,
      ALARM_TRIGGERED: 4,
    },
    SecuritySystemTargetState: {
      STAY_ARM: 0,
      AWAY_ARM: 1,
      NIGHT_ARM: 2,
      DISARM: 3,
    },
    MotionDetected: 'MotionDetected',
    StatusActive: 'StatusActive',
    ProgrammableSwitchEvent,
  },
  uuid: {
    generate: jest.fn((value: string) => `uuid-${value}`),
  },
  // CameraController support for snapshot tests
  SRTPCryptoSuites: { AES_CM_128_HMAC_SHA1_80: 0 },
  H264Profile: { BASELINE: 0, MAIN: 1, HIGH: 2 },
  H264Level: { LEVEL3_1: 0, LEVEL3_2: 1, LEVEL4_0: 2 },
  AudioStreamingCodecType: { OPUS: 0, AAC_ELD: 1, PCMA: 2, PCMU: 3 },
  AudioStreamingSamplerate: { KHZ_8: 8, KHZ_16: 16, KHZ_24: 24 },
  CameraController: jest.fn().mockImplementation(() => ({})),
});

export class MockCharacteristic {
  public onGetHandler?: () => unknown | Promise<unknown>;
  public onSetHandler?: (value: unknown) => unknown | Promise<unknown>;
  public value: unknown = undefined;

  onGet(handler: () => unknown | Promise<unknown>): this {
    this.onGetHandler = handler;
    return this;
  }

  onSet(handler: (value: unknown) => unknown | Promise<unknown>): this {
    this.onSetHandler = handler;
    return this;
  }

  setProps(_props: Record<string, unknown>): this {
    return this;
  }

  updateValue(value: unknown): this {
    this.value = value;
    return this;
  }
}

export class MockService {
  public readonly characteristics = new Map<string, MockCharacteristic>();
  public readonly setCharacteristic = jest.fn(() => this);

  constructor(public readonly type: string, public readonly name?: string) {}

  getCharacteristic(type: string | Record<string, number> | ((...args: unknown[]) => unknown)): MockCharacteristic {
    // Handle string keys, enum objects (like SecuritySystemTargetState), and function types
    let key: string;
    if (typeof type === 'function') {
      // For function types (like ProgrammableSwitchEvent), use toString
      key = type.toString ? type.toString() : String(type);
    } else if (typeof type === 'object') {
      key = JSON.stringify(type);
    } else {
      key = type;
    }
    if (!this.characteristics.has(key)) {
      this.characteristics.set(key, new MockCharacteristic());
    }
    return this.characteristics.get(key) as MockCharacteristic;
  }
}

export class MockAccessory {
  public context: Record<string, unknown> = {};
  public services = new Map<string, MockService>();

  constructor(public readonly displayName: string, public readonly UUID: string, private readonly hap: ReturnType<typeof createHap>) {
    this.services.set(this.hap.Service.AccessoryInformation, new MockService(this.hap.Service.AccessoryInformation, displayName));
  }

  getService(name: string): MockService | undefined {
    return this.services.get(name);
  }

  addService(name: string, displayName?: string): MockService {
    const service = new MockService(name, displayName);
    this.services.set(name, service);
    return service;
  }

  configureController(_controller: unknown): void {
    // Mock implementation for CameraController
  }
}

export const createLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
});

export const createApi = (hap = createHap()) => {
  const listeners: Record<string, Array<() => void>> = {};
  const platformAccessory = jest.fn(function construct(name: string, uuid: string) {
    return new MockAccessory(name, uuid, hap);
  }) as unknown as typeof MockAccessory;

  return {
    hap,
    platformAccessory,
    registerPlatformAccessories: jest.fn(),
    on: jest.fn((event: string, callback: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(callback);
    }),
    emit: (event: string) => {
      for (const cb of listeners[event] ?? []) {
        cb();
      }
    },
  };
};
