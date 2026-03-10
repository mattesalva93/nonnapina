export type ChannelName = 'WHATSAPP' | 'TELEGRAM';

export interface ChannelResult {
  channel: ChannelName;
  success: boolean;
  error?: string;
}

export interface ChannelPayload {
  postContent: string;
  imageUrl: string | undefined;
}

export interface BufferChannelPayload {
  postContent: string;
  imageBuffer: Buffer | undefined;
}

export interface ChannelDef {
  name: ChannelName;
  send: (payload: ChannelPayload) => Promise<ChannelResult>;
}

export interface BufferChannelDef {
  name: ChannelName;
  send: () => Promise<ChannelResult>;
}
