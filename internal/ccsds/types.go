package ccsds

// TransferFrame represents a CCSDS TM Transfer Frame (CCSDS 132.0-B-3)
type TransferFrame struct {
	// Primary header (6 bytes)
	TransferFrameVersion    uint8  // 2 bits, must be 0b01
	SpacecraftID            uint16 // 10 bits
	VirtualChannelID        uint8  // 6 bits
	OperationalControlField bool   // 1 bit (OCF present flag)
	MasterChannelFC         uint8  // 8 bits (MCFC)
	VirtualChannelFC        uint8  // 8 bits (VCFC)

	// Data field status (2 bytes)
	SecHdrFlag         bool   // 1 bit
	SyncFlag           bool   // 1 bit
	PacketOrderFlag    bool   // 1 bit
	SegLenID           uint8  // 2 bits
	FirstHeaderPointer uint16 // 11 bits (0x7FF = no packet start, 0x7FE = idle)

	// Payload
	DataField []byte // variable length

	// Optional fields
	OCF  *uint32 // 4 bytes if OperationalControlField=true
	FECF *uint16 // 2 bytes CRC if enabled

	// Metadata (added by Frame Ingest)
	ReceiveTimestampNs int64
	AntennaID          string
	PassID             string
	Replay             bool
}

// SpacePacket represents a CCSDS Space Packet (CCSDS 133.0-B-2)
type SpacePacket struct {
	// Primary header (6 bytes)
	Version    uint8  // 3 bits, must be 0b000
	Type       uint8  // 1 bit (0=TM, 1=TC)
	SecHdrFlag bool   // 1 bit
	APID       uint16 // 11 bits
	SeqFlags   uint8  // 2 bits (0b00=cont, 0b01=first, 0b10=last, 0b11=unsegmented)
	SeqCount   uint16 // 14 bits (0..16383)
	DataLength uint16 // 16 bits (length of data field - 1)

	// Payload
	Data []byte

	// Derived / Ingest metadata
	SCID       uint16
	OBTRaw     uint64
	ReceivedAt int64 // nanoseconds
	PassID     string
	Replay     bool
}

// CLCW represents the Command Link Control Word (CCSDS 232.1-B-2)
type CLCW struct {
	ControlWordType uint8  // 1 bit, must be 0
	CLCWVersion     uint8  // 2 bits, must be 0b00
	StatusField     uint8  // 3 bits
	CopInEffect     uint8  // 2 bits (01 = COP-1)
	VirtualChannelID uint8 // 6 bits
	ReservedB       uint8  // 2 bits
	NoRF            bool
	NoBitLock       bool
	Lockout         bool
	Wait            bool
	Retransmit      bool
	FarmerBCounter  uint8 // 2 bits
	Reserved        uint8 // 1 bit
	ReportValue     uint8 // 8 bits (V(R) - Next expected V(S))
}

// TCTransferFrame represents a CCSDS TC Transfer Frame (CCSDS 232.0-B-4)
type TCTransferFrame struct {
	// Primary header (5 bytes)
	TransferFrameVersion uint8  // 2 bits, 0b00
	BypassFlag           bool   // 1 bit (Type-BC if true, Type-AD if false)
	ControlCommandFlag   bool   // 1 bit
	Reserved             uint8  // 2 bits
	SpacecraftID         uint16 // 10 bits
	VirtualChannelID     uint8  // 6 bits
	FrameLength          uint16 // 10 bits (total frame length - 1)
	SeqNumber            uint8  // 8 bits (V(S))

	// Data field
	Data []byte

	// Frame Error Control
	FECF uint16 // CRC-16
}
