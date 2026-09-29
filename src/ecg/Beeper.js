// The monitor beep. Pulse oximeters drop the pitch as saturation falls, so
// the tone follows SpO2. Off until the visitor turns it on.
export class Beeper {
  constructor() {
    this.enabled = false;
    this.ctx = null;
  }

  async enable() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
    }
    await this.ctx.resume();
    this.enabled = true;
    return true;
  }

  disable() {
    this.enabled = false;
  }

  beep(spo2 = 99, pvc = false) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = (pvc ? 560 : 440) + (spo2 - 85) * 28;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  }
}
