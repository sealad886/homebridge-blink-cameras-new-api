/* Shared by the real settings page and its local, synthetic host. */
(function (root) {
  'use strict';
  const copy = value => value === undefined ? undefined : structuredClone(value);
  const serialize = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  function deadline(promise, milliseconds = 12000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Settings request timed out.')), milliseconds);
      Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }
  class Draft {
    constructor(blocks, host) {
      this.blocks = copy(blocks);
      this.index = this.blocks.findIndex(block => block.platform === 'BlinkCameras');
      if (this.index < 0) {
        this.index = this.blocks.length;
        this.blocks.push({ platform: 'BlinkCameras', name: 'Blink' });
      }
      this.baseline = serialize(this.blocks);
      this.staged = this.baseline;
      this.host = host;
      this.revision = 0;
      this.inventoryRevision = undefined;
      this.state = { pending: false, errors: [], warnings: [], error: '', dirty: false, accountAction: false };
      this.running = null;
    }
    get config() { return this.blocks[this.index]; }
    hasUserChanges() { return serialize(this.blocks) !== this.baseline; }
    canRunAccountAction() { return !this.hasUserChanges() && !this.state.pending && !this.state.accountAction; }
    beginAccountAction() {
      if (!this.canRunAccountAction()) return null;
      this.state.accountAction = true;
      this.host.saveEnabled(false);
      this.host.changed(this.state);
      let active = true;
      return {
        blocks: copy(this.blocks),
        finish: () => {
          if (!active) return;
          active = false;
          this.state.accountAction = false;
          this.retry();
        },
      };
    }
    set(key, value) {
      if (this.state.accountAction) return false;
      if (value === undefined) delete this.config[key]; else this.config[key] = copy(value);
      this.retry(); return true;
    }
    retry() {
      if (this.state.accountAction) return;
      this.revision += 1;
      this.state.pending = true;
      this.state.dirty = this.hasUserChanges();
      this.state.error = '';
      this.host.saveEnabled(false);
      this.host.changed(this.state);
      if (!this.running) this.running = Promise.resolve().then(() => this.pump()).finally(() => { this.running = null; });
    }
    async pump() {
      for (;;) {
        const revision = this.revision;
        const blocks = copy(this.blocks);
        try {
          const result = await this.host.validate({ revision, config: blocks[this.index], inventoryRevision: this.inventoryRevision });
          if (revision !== this.revision) continue;
          if (result.revision !== revision) throw new Error('validation revision');
          this.state.errors = result.errors || [];
          this.state.warnings = result.warnings || [];
          if (result.valid) {
            const serialized = serialize(blocks);
            if (serialized !== this.staged) {
              this.staged = undefined;
              await this.host.stage(blocks);
              this.staged = serialized;
            }
            if (revision !== this.revision) continue;
            this.host.saveEnabled(this.state.dirty);
          }
        } catch {
          if (revision !== this.revision) continue;
          this.state.error = 'Homebridge could not validate or stage these changes. Retry before saving.';
        }
        if (revision !== this.revision) continue;
        this.state.pending = false;
        this.host.changed(this.state);
        return;
      }
    }
    async flush() { while (this.running) await this.running; }
    replaceBaseline(blocks) {
      if (this.hasUserChanges()) throw new Error('Save or discard settings before an account action.');
      this.blocks = copy(blocks);
      this.index = this.blocks.findIndex(block => block.platform === 'BlinkCameras');
      this.baseline = this.staged = serialize(this.blocks);
      this.retry();
    }
  }
  function resolveSelector(token, cameras) {
    if (typeof token !== 'string' || !token.trim()) return [];
    return cameras.filter(camera => token === camera.key || (!/^(camera|owl|doorbell):/.test(token)
      && [String(camera.id), camera.name, camera.serial].includes(token)));
  }
  function toggleSelection(values, camera, enabled, cameras) {
    const next = values.filter(value => {
      const matches = resolveSelector(value, cameras);
      return !(matches.length === 1 && matches[0].key === camera.key);
    });
    return enabled ? [...next, camera.key] : next;
  }
  const api = { Draft, resolveSelector, toggleSelection, deadline };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BlinkSettings = api;
})(typeof window === 'object' ? window : globalThis);
