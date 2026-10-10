export {};

declare global {
  interface Window {
    cutlineDesktop?: {
      confirmMediaRemoval(details: { fileName: string; clipCount: number }): Promise<boolean>;
      pickMediaFiles(): Promise<Array<{
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
    };
  }
}
