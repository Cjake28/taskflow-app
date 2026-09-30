/** Cross-tab auth events (spec §14.5): logging out in one tab logs out every tab. */
export type SessionMessage = { type: 'logout' } | { type: 'login' };

const CHANNEL_NAME = 'tf-auth';

export interface SessionChannel {
  post: (message: SessionMessage) => void;
  close: () => void;
}

export function openSessionChannel(onMessage: (message: SessionMessage) => void): SessionChannel {
  if (typeof BroadcastChannel === 'undefined') {
    return { post: () => {}, close: () => {} };
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (
      typeof data === 'object' &&
      data !== null &&
      ((data as SessionMessage).type === 'logout' || (data as SessionMessage).type === 'login')
    ) {
      onMessage(data as SessionMessage);
    }
  };
  return {
    post: (message) => channel.postMessage(message),
    close: () => channel.close(),
  };
}
