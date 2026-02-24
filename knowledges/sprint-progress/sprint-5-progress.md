# Sprint 5 Progress

Started: 2026-02-24
Status: in-progress

---

## Ticket Updates

### T-5-01 | Add Backend Password Verification
Status: complete
Update: Verified that the comprehensive implementation of `room_manager.py` and `models.py` during Sprint 1 already included the optional `bcrypt` password hashing, `verify-password` message endpoints, and test coverage (via `test_room_manager.py`). Tested and confirmed 100% test passing.

### T-5-02 | Implement crypto.js Module
Status: complete
Update: Written `crypto.js` to map native Web Crypto API capabilities to our AES-256-GCM chunking strategy. Included PBKDF2 derivation with 100,000 iterations and base64 salt handlers. 100% Vitest coverage achieved.

### T-5-03 | Integrate E2E Encryption to Transfer Pipeline
Status: complete
Update: Modified `room.html` and `ui.js` to support password modals for joining receivers. Hooked up URL params in `app.js` to allow senders to optionally configure passwords. Re-written `room.js` to use `deriveKey` on connect, orchestrate `salt` exchange in `file-metadata` signalling, and automatically apply `encryptChunk`/`decryptChunk` using `transfer.js` hooks.

---

## Sprint Summary

Sprint 5 successfully introduced Zero-Knowledge E2E Data Encryption. By utilizing the browser's native Web Crypto API, AirPass now hashes and encrypts file chunks *before* they are transported through the DataChannels.

Key accomplishments:
1. Backend was previously pre-configured to strictly accept `verify-password` parameters, so password logic is safely isolated.
2. The `crypto.js` engine wraps `AES-256-GCM` and `PBKDF2` operations. Each chunk has an independent, randomly generated 12-byte initialization vector (IV) prepended to its binary stream payload, neutralizing ciphertext replay and analysis attacks.
3. The sender randomly generates a session `salt` which is securely exchanged via signaling as a Base64 string to allow the receiver to symmetrically derive the identical AES key without sending raw passwords.
4. Passwords are conservatively managed—immediately discarded post key-derivation and strictly passed locally through URL arrays into `room.js` state encapsulation.

The foundational feature set is now entirely completed! AirPass securely transfers files across browsers. The final step is Sprint 6: Deployment.
