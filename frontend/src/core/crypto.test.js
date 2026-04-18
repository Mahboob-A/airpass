/**
 * Tests for Web Crypto key derivation and AES-GCM encryption.
 *
 * COVERAGE REQUIREMENT: 100% — encryption is safety-critical.
 * See SRS.md §6.4 and development-guideline.md §3.3.
 * See SRS.md §FR-12 and FR-13 for encryption requirements.
 */
import { describe, it, expect } from 'vitest'
import {
    generateSalt,
    deriveKey,
    encryptChunk,
    decryptChunk,
    SALT_LENGTH,
    IV_LENGTH,
} from './crypto.js'

describe('generateSalt', () => {
    it('should return a Uint8Array of SALT_LENGTH bytes', () => {
        const salt = generateSalt()
        expect(salt).toBeInstanceOf(Uint8Array)
        expect(salt.length).toBe(SALT_LENGTH)
    })

    it('should return different values each call', () => {
        const a = generateSalt()
        const b = generateSalt()
        expect(Array.from(a)).not.toEqual(Array.from(b))
    })
})

describe('deriveKey', () => {
    it('should return a CryptoKey', async () => {
        const salt = generateSalt()
        const key = await deriveKey('test-password', salt)
        expect(key).toHaveProperty('type')
        expect(key.type).toBe('secret')
    })

    it('should produce the same key from the same password and salt', async () => {
        const salt = generateSalt()
        const key1 = await deriveKey('same-password', salt)
        const key2 = await deriveKey('same-password', salt)
        // Export and compare
        const raw1 = await crypto.subtle.exportKey('raw', key1)
        const raw2 = await crypto.subtle.exportKey('raw', key2)
        expect(new Uint8Array(raw1)).toEqual(new Uint8Array(raw2))
    })

    it('should produce different keys for different passwords', async () => {
        const salt = generateSalt()
        const key1 = await deriveKey('password-one', salt)
        const key2 = await deriveKey('password-two', salt)
        const raw1 = await crypto.subtle.exportKey('raw', key1)
        const raw2 = await crypto.subtle.exportKey('raw', key2)
        expect(new Uint8Array(raw1)).not.toEqual(new Uint8Array(raw2))
    })

    it('should produce different keys for different salts', async () => {
        const key1 = await deriveKey('password', generateSalt())
        const key2 = await deriveKey('password', generateSalt())
        const raw1 = await crypto.subtle.exportKey('raw', key1)
        const raw2 = await crypto.subtle.exportKey('raw', key2)
        expect(new Uint8Array(raw1)).not.toEqual(new Uint8Array(raw2))
    })
})

describe('encryptChunk / decryptChunk', () => {
    it('should produce output larger than input (IV overhead)', async () => {
        const salt = generateSalt()
        const key = await deriveKey('password', salt)
        const plaintext = new Uint8Array([1, 2, 3, 4, 5]).buffer
        const ciphertext = await encryptChunk(plaintext, key)
        expect(ciphertext.byteLength).toBeGreaterThan(plaintext.byteLength)
    })

    it('should prepend a 12-byte IV', async () => {
        const salt = generateSalt()
        const key = await deriveKey('password', salt)
        const plaintext = new Uint8Array(100).buffer
        const ciphertext = await encryptChunk(plaintext, key)
        // IV is the first IV_LENGTH bytes
        expect(ciphertext.byteLength).toBe(IV_LENGTH + 100 + 16)  // +16 for GCM auth tag
    })

    it('should decrypt to original plaintext', async () => {
        const salt = generateSalt()
        const key = await deriveKey('password', salt)
        const original = new Uint8Array([10, 20, 30, 40, 50])
        const encrypted = await encryptChunk(original.buffer, key)
        const decrypted = await decryptChunk(encrypted, key)
        expect(new Uint8Array(decrypted)).toEqual(original)
    })

    it('should fail to decrypt with wrong key', async () => {
        const salt = generateSalt()
        const key1 = await deriveKey('correct-password', salt)
        const key2 = await deriveKey('wrong-password', salt)
        const plaintext = new Uint8Array([1, 2, 3]).buffer
        const encrypted = await encryptChunk(plaintext, key1)
        await expect(decryptChunk(encrypted, key2)).rejects.toThrow()
    })

    it('should produce different ciphertext for same plaintext (random IV)', async () => {
        const salt = generateSalt()
        const key = await deriveKey('password', salt)
        const plaintext = new Uint8Array([1, 2, 3, 4, 5]).buffer
        const c1 = await encryptChunk(plaintext, key)
        const c2 = await encryptChunk(plaintext, key)
        expect(new Uint8Array(c1)).not.toEqual(new Uint8Array(c2))
    })
})
