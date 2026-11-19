/* ============================================================
   QUBIRA — utilidades de Passkeys (WebAuthn) para el navegador.
   Lo usan login.html (ingresar) y modulo.html (registrar).
   Convierte entre el JSON que manda la API (base64url) y los
   ArrayBuffer que pide navigator.credentials, sin librerías externas.
   ============================================================ */
(function () {
  'use strict';

  function b64urlToBuf(s) {
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  function bufToB64url(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  const mapCreds = list => (list || []).map(c => ({ ...c, id: b64urlToBuf(c.id) }));

  function creationOptions(json) {
    if (window.PublicKeyCredential && PublicKeyCredential.parseCreationOptionsFromJSON) {
      return PublicKeyCredential.parseCreationOptionsFromJSON(json);
    }
    return {
      ...json,
      challenge: b64urlToBuf(json.challenge),
      user: { ...json.user, id: b64urlToBuf(json.user.id) },
      excludeCredentials: mapCreds(json.excludeCredentials),
    };
  }
  function requestOptions(json) {
    if (window.PublicKeyCredential && PublicKeyCredential.parseRequestOptionsFromJSON) {
      return PublicKeyCredential.parseRequestOptionsFromJSON(json);
    }
    return { ...json, challenge: b64urlToBuf(json.challenge), allowCredentials: mapCreds(json.allowCredentials) };
  }

  function credentialToJSON(cred) {
    if (typeof cred.toJSON === 'function') {
      try { return cred.toJSON(); } catch (_) { /* algunos gestores de contraseñas rompen toJSON */ }
    }
    const r = cred.response;
    const response = { clientDataJSON: bufToB64url(r.clientDataJSON) };
    if (r.attestationObject) {
      response.attestationObject = bufToB64url(r.attestationObject);
      if (typeof r.getTransports === 'function') response.transports = r.getTransports();
    } else {
      response.authenticatorData = bufToB64url(r.authenticatorData);
      response.signature = bufToB64url(r.signature);
      if (r.userHandle) response.userHandle = bufToB64url(r.userHandle);
    }
    return {
      id: cred.id, rawId: bufToB64url(cred.rawId), type: cred.type, response,
      clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
      authenticatorAttachment: cred.authenticatorAttachment || undefined,
    };
  }

  /* Mensaje legible para los errores del navegador */
  function friendlyError(err) {
    const name = err && err.name;
    if (name === 'NotAllowedError') return 'Se canceló o se agotó el tiempo. Vuelve a intentarlo.';
    if (name === 'InvalidStateError') return 'Ese dispositivo ya tiene una passkey registrada para tu cuenta.';
    if (name === 'SecurityError') return 'Las passkeys solo funcionan en el login oficial de QUBIRA (https).';
    if (name === 'NotSupportedError') return 'Este navegador o dispositivo no soporta passkeys.';
    return (err && err.message) || 'Error con la passkey.';
  }

  window.QubiraPasskey = {
    supported: () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext),
    async create(optionsJSON) {
      const cred = await navigator.credentials.create({ publicKey: creationOptions(optionsJSON) });
      return credentialToJSON(cred);
    },
    async get(optionsJSON) {
      const cred = await navigator.credentials.get({ publicKey: requestOptions(optionsJSON) });
      return credentialToJSON(cred);
    },
    friendlyError,
  };
})();
