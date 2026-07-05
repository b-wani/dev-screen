import type { DevScreenApi } from './index'

declare global {
  interface Window {
    devScreen: DevScreenApi
  }
}
