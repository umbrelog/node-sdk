import type { LogEntry } from '../types';

export interface ReplayOptions {
  startTime?: number;
  endTime?: number;
}

type BufferItem = { entry: LogEntry; timestamp: number };

export class CircularBuffer {
  private buffer: Array<BufferItem | undefined>;
  private writeIndex = 0;

  constructor(
    private size = 1000,
    private ttl = 120000,
  ) {
    this.buffer = new Array(size);
  }

  add(entry: LogEntry): void {
    const now = Date.now();
    this.cleanup(now);
    this.buffer[this.writeIndex] = { entry, timestamp: now };
    this.writeIndex = (this.writeIndex + 1) % this.size;
  }

  getAll(): LogEntry[] {
    const now = Date.now();
    this.cleanup(now);
    return this.buffer
      .filter((item): item is BufferItem => item !== undefined && now - item.timestamp < this.ttl)
      .map((item) => item.entry);
  }

  flush(): LogEntry[] {
    const entries = this.getAll();
    this.buffer = new Array(this.size);
    this.writeIndex = 0;
    return entries;
  }

  getSize(): number {
    const now = Date.now();
    this.cleanup(now);
    return this.buffer.filter(
      (item): item is BufferItem => item !== undefined && now - item.timestamp < this.ttl,
    ).length;
  }

  private cleanup(now: number): void {
    for (let i = 0; i < this.buffer.length; i++) {
      const item = this.buffer[i];
      if (item && now - item.timestamp >= this.ttl) this.buffer[i] = undefined;
    }
  }

  clear(): void {
    this.buffer = new Array(this.size);
    this.writeIndex = 0;
  }

  replayByTimeRange(startTime: number, endTime: number): LogEntry[] {
    return this.replay({ startTime, endTime });
  }

  replay(options: ReplayOptions = {}): LogEntry[] {
    const now = Date.now();
    this.cleanup(now);
    const { startTime, endTime } = options;
    if (startTime === undefined && endTime === undefined) return this.getAll();

    return this.buffer
      .filter((item): item is BufferItem => {
        if (!item || now - item.timestamp >= this.ttl) return false;
        const entry = item.entry;
        if (startTime !== undefined && entry.timestamp < startTime) return false;
        if (endTime !== undefined && entry.timestamp > endTime) return false;
        return true;
      })
      .map((item) => item.entry)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  replayLastMinutes(minutes: number): LogEntry[] {
    const now = Date.now();
    return this.replayByTimeRange(now - minutes * 60_000, now);
  }
}
