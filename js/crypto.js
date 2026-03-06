/* 역할: Web Crypto API 기반 PBKDF2 해시/검증을 제공해 비밀번호를 안전하게 저장한다. */

(function attachCryptoService(global) {
  const PBKDF2_ITERATIONS = 150000;
  const PBKDF2_HASH = "SHA-256";
  const SALT_LENGTH = 16;

  function ensureWebCrypto() {
    if (!global.crypto || !global.crypto.subtle) {
      throw new Error("이 브라우저는 Web Crypto API를 지원하지 않습니다.");
    }
  }

  function randomBytes(length) {
    const array = new Uint8Array(length);
    global.crypto.getRandomValues(array);
    return array;
  }

  function bytesToBase64(bytes) {
    let binary = "";

    bytes.forEach((value) => {
      binary += String.fromCharCode(value);
    });

    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  async function derivePasswordHash(password, saltBase64) {
    ensureWebCrypto();

    const encoder = new TextEncoder();
    const passwordKey = await global.crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    const derivedBits = await global.crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: base64ToBytes(saltBase64),
        iterations: PBKDF2_ITERATIONS,
        hash: PBKDF2_HASH
      },
      passwordKey,
      256
    );

    return bytesToBase64(new Uint8Array(derivedBits));
  }

  async function hashPassword(password) {
    if (!password || password.length < 8) {
      throw new Error("비밀번호는 8자 이상이어야 합니다.");
    }

    const salt = bytesToBase64(randomBytes(SALT_LENGTH));
    const hash = await derivePasswordHash(password, salt);

    return {
      algorithm: "PBKDF2",
      hash,
      salt,
      iterations: PBKDF2_ITERATIONS,
      digest: PBKDF2_HASH
    };
  }

  function safeEqual(left, right) {
    if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
      return false;
    }

    let diff = 0;

    for (let index = 0; index < left.length; index += 1) {
      diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }

    return diff === 0;
  }

  async function verifyPassword(password, storedSecret) {
    if (!storedSecret || storedSecret.algorithm !== "PBKDF2") {
      return false;
    }

    const candidateHash = await derivePasswordHash(password, storedSecret.salt);
    return safeEqual(candidateHash, storedSecret.hash);
  }

  global.CryptoService = {
    hashPassword,
    verifyPassword
  };
})(window);
