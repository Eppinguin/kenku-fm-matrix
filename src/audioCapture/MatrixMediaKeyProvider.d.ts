// SPDX-License-Identifier: GPL-3.0-only

import { BaseKeyProvider } from "livekit-client";
import type { MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";

/**
 * Type declaration for MatrixMediaKeyProvider.js.
 *
 * The implementation intentionally remains JavaScript so Kenku's TypeScript
 * compilation does not downlevel inheritance from LiveKit's native ES class.
 */
export class MatrixMediaKeyProvider extends BaseKeyProvider {
  setSession(session: MatrixRTCSession): void;
  clearSession(): void;
}
