import { toHapName } from '../src/hap-name';

describe('toHapName', () => {
  it.each([
    ['Corner (G8T1-K001-3255-014P)', 'Corner (G8T1-K001-3255-014P'],
    ['  Front  Kitchen  ', 'Front Kitchen'],
    ['🏠 Front Camera 🔔', 'Front Camera'],
    ['TV / Lounge', 'TV / Lounge'],
    ['Caméra arrière', 'Caméra arrière'],
  ])('normalizes %j to a current HAP-compatible name', (input, expected) => {
    expect(toHapName(input, 'Blink Camera')).toBe(expected);
  });

  it.each(['', '!', 'A'])('uses a valid contextual fallback for unusable input %j', input => {
    expect(toHapName(input, 'Blink Camera')).toBe('Blink Camera');
  });

  it('uses a built-in valid fallback when both supplied values are unusable', () => {
    expect(toHapName('!', 'A')).toBe('Blink Device');
  });

  it('caps names at the current HAP limit and retains an alphanumeric ending', () => {
    expect(toHapName(`${'A'.repeat(63)}-)`, 'Blink Camera')).toBe('A'.repeat(63));
  });

  it('caps names by UTF-16 code units without splitting a supplementary character', () => {
    expect(toHapName(`${'A'.repeat(63)}𐐀`, 'Blink Camera')).toBe('A'.repeat(63));
  });
});

describe('device service names', () => {
  it('retains a contiguous prefix at supplementary-character boundaries', () => {
    const { deviceServiceName } = require('../src/hap-name');
    expect(deviceServiceName('A'.repeat(46) + '𐐀B', 'Refresh Snapshot'))
      .toBe('A'.repeat(46) + ' Refresh Snapshot');
  });

  it('keeps the assigned camera name and purpose for long Unicode labels', () => {
    const { deviceServiceName } = require('../src/hap-name');
    const name = deviceServiceName('𐐀'.repeat(40), 'Refresh Snapshot');
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name.endsWith(' Refresh Snapshot')).toBe(true);
    expect(name.startsWith('𐐀')).toBe(true);
  });

  it.each(['Switch', 'MotionSensor', 'Doorbell', 'SecuritySystem'])('publishes a warning-free configured label for real HAP %s services', (type) => {
    const { Service, Characteristic } = require('hap-nodejs');
    const { setHapServiceName, deviceServiceName } = require('../src/hap-name');
    const service = new Service[type]('SwitchCorner', 'motion-switch');
    const warning = jest.fn();
    service.on('characteristic-warning', warning);
    const name = deviceServiceName('Corner', 'Motion Detection');
    setHapServiceName(service, Characteristic.Name, name, 'Blink Motion', Characteristic.ConfiguredName);
    expect(service.getCharacteristic(Characteristic.Name).value).toBe('Corner Motion Detection');
    expect(service.getCharacteristic(Characteristic.ConfiguredName).value).toBe('Corner Motion Detection');
    expect(service.subtype).toBe('motion-switch');
    expect(warning).not.toHaveBeenCalled();
  });
});
