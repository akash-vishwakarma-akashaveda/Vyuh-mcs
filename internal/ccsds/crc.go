package ccsds

// ComputeCRC16CCITT calculates the 16-bit CRC-CCITT (polynomial 0x1021, initial value 0xFFFF)
// used in CCSDS 132.0-B-3 and CCSDS 232.0-B-4.
func ComputeCRC16CCITT(data []byte) uint16 {
	crc := uint16(0xFFFF)
	for _, b := range data {
		crc ^= uint16(b) << 8
		for i := 0; i < 8; i++ {
			if (crc & 0x8000) != 0 {
				crc = (crc << 1) ^ 0x1021
			} else {
				crc = crc << 1
			}
		}
	}
	return crc
}

// VerifyCRC16 checks if the CRC over the data matches expectedCRC.
func VerifyCRC16(data []byte, expectedCRC uint16) bool {
	return ComputeCRC16CCITT(data) == expectedCRC
}
