import type { Bridge } from './types';

declare global {
  interface Window {
    api?: Bridge;
  }
}

export {};
