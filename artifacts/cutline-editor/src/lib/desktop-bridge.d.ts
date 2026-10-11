export {};

declare global {
  interface Window {
    cutlineDesktop?: {
      confirmMediaRemoval(details: { fileName: string; clipCount: number }): Promise<boolean>;
      pickMediaFiles(kind?: 'video' | 'audio'): Promise<Array<{
        token: string;
        name: string;
        mimeType: string;
        byteSize: number;
        url: string;
      }>>;
      releaseMediaFiles(tokens: string[]): Promise<boolean>;
      onCloseRequested(listener: (requestId: string) => void): () => void;
      onCloseCancelled(listener: () => void): () => void;
      completeCloseRequest(requestId: string, saved: boolean): Promise<boolean>;
      updateRichPresence(settings: {
        enabled: boolean;
        clientId: string;
        imageKey: string;
        shareProjectName: boolean;
        workflow: 'editing' | 'exporting' | 'media-library';
        projectName?: string;
      }): Promise<'disabled' | 'needs-setup' | 'connecting' | 'connected' | 'unavailable'>;
      onRichPresenceStatus(listener: (
        status: 'disabled' | 'needs-setup' | 'connecting' | 'connected' | 'unavailable'
      ) => void): () => void;
    };
  }
}
