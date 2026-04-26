export type BroadcastState = 'idle' | 'preview' | 'connecting' | 'live' | 'stopped' | 'error';

export interface BroadcastConfig {
  rtmpUrl: string;
  streamKey: string;
  videoBitrate: number;
  audioBitrate: number;
  fps: number;
}

export interface NativeBroadcaster {
  startPreview(): Promise<void>;
  start(config: BroadcastConfig): Promise<void>;
  stop(): Promise<void>;
}

export function createNativeBroadcaster(): NativeBroadcaster {
  return {
    async startPreview() {
      // Wire this to the RTMP encoder preview after adding the native module.
    },
    async start() {
      throw new Error('Native RTMP broadcaster module is not installed yet.');
    },
    async stop() {
      // No-op until the native broadcaster is installed.
    },
  };
}
