// SPDX-License-Identifier: GPL-3.0-only

import { BaseKeyProvider } from "livekit-client";
import { MatrixRTCSessionEvent } from "matrix-js-sdk/lib/matrixrtc";

/**
 * Adapts MatrixRTC media keys to LiveKit's E2EE key provider interface.
 *
 * Keep this class in JavaScript. Kenku's TypeScript target downlevels class
 * inheritance, which is incompatible with LiveKit's native BaseKeyProvider
 * class and throws "Class constructor ... cannot be invoked without 'new'".
 */
export class MatrixMediaKeyProvider extends BaseKeyProvider {
  constructor() {
    super({ ratchetWindowSize: 10, keyringSize: 256 });
    this.session = undefined;

    this.handleEncryptionKeyChanged = async (
      rawKey,
      keyIndex,
      _membership,
      rtcBackendIdentity,
    ) => {
      try {
        const keyMaterial = await crypto.subtle.importKey(
          "raw",
          rawKey,
          "HKDF",
          false,
          ["deriveBits", "deriveKey"],
        );
        this.onSetEncryptionKey(keyMaterial, rtcBackendIdentity, keyIndex);
      } catch (error) {
        console.error("Unable to import MatrixRTC media key", error);
      }
    };
  }

  setSession(session) {
    this.clearSession();
    this.session = session;
    session.on(
      MatrixRTCSessionEvent.EncryptionKeyChanged,
      this.handleEncryptionKeyChanged,
    );
    session.reemitEncryptionKeys();
  }

  clearSession() {
    if (this.session) {
      this.session.off(
        MatrixRTCSessionEvent.EncryptionKeyChanged,
        this.handleEncryptionKeyChanged,
      );
    }
    this.session = undefined;
  }
}
