export {};

declare global {
  interface Window {
    cutlineDesktop?: {
      confirmMediaRemoval(details: { fileName: string; clipCount: number }): Promise<boolean>;
    };
  }
}
