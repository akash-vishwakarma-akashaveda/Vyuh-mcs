package command

import (
	"crypto/aes"
	"crypto/cipher"
	"errors"
)

// SDLSAAD is the additional authenticated data bound to every telecommand:
// the spacecraft id, the application id and the space packet sequence count —
// exactly the fields the spacecraft reads from the TC space packet header, so
// a packet replayed under another header fails authentication (SDLS-style).
func SDLSAAD(scid, apid, seq uint16) []byte {
	return []byte{byte(scid >> 8), byte(scid), byte(apid >> 8), byte(apid), byte(seq >> 8), byte(seq)}
}

// Payload is what travels in the TC space packet data field: IV || ciphertext || tag.
func (p *TCSpacePacket) Payload() []byte {
	out := make([]byte, 0, len(p.IV)+len(p.Ciphertext)+len(p.GCMTag))
	out = append(out, p.IV...)
	out = append(out, p.Ciphertext...)
	return append(out, p.GCMTag...)
}

// OpenTCPayload is the spacecraft side of Payload: authenticate and decrypt a
// TC space packet data field with the satellite's uplink key.
func OpenTCPayload(key []byte, scid, apid, seq uint16, payload []byte) ([]byte, error) {
	const ivLen, tagLen = 12, 16
	if len(payload) < ivLen+tagLen {
		return nil, errors.New("tc payload too short")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, payload[:ivLen], payload[ivLen:], SDLSAAD(scid, apid, seq))
}
