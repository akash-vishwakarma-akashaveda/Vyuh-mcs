package command

import "time"

type Priority uint8

const (
	PriorityCritical Priority = 0
	PriorityHigh     Priority = 1
	PriorityNormal   Priority = 2
	PriorityLow      Priority = 3
)

func (p Priority) String() string {
	switch p {
	case PriorityCritical:
		return "CRITICAL"
	case PriorityHigh:
		return "HIGH"
	case PriorityNormal:
		return "NORMAL"
	case PriorityLow:
		return "LOW"
	default:
		return "NORMAL"
	}
}

type CommandStatus string

const (
	StatusPending            CommandStatus = "PENDING"
	StatusQueued             CommandStatus = "QUEUED"
	StatusSent               CommandStatus = "SENT"
	StatusAcknowledged       CommandStatus = "ACKNOWLEDGED"
	StatusFailed             CommandStatus = "FAILED"
	StatusRejectedRange      CommandStatus = "REJECTED_RANGE"
	StatusRejectedConstraint CommandStatus = "REJECTED_CONSTRAINT"
	StatusRejectedInhibited  CommandStatus = "REJECTED_INHIBITED"
	StatusRejectedInterlock  CommandStatus = "REJECTED_INTERLOCK"
	StatusCancelled          CommandStatus = "CANCELLED"
	// StatusCancelRejected reports that a cancel arrived after the command was
	// radiated; the command's own status is unchanged.
	StatusCancelRejected CommandStatus = "CANCEL_REJECTED"
	// PUS-1 verification from the spacecraft (TM(1,1)/(1,2), TM(1,7)/(1,8)).
	StatusAcceptedOnBoard CommandStatus = "ACCEPTED"
	StatusCompleted       CommandStatus = "COMPLETED"
	StatusExecFailed      CommandStatus = "EXECUTION_FAILED"
)

// Rank orders statuses along the lifecycle so a late, older event never
// overwrites a newer one. Terminal statuses rank highest.
func Rank(s CommandStatus) int {
	switch s {
	case StatusPending:
		return 0
	case StatusQueued:
		return 1
	case StatusSent:
		return 2
	case StatusAcknowledged:
		return 3
	case StatusAcceptedOnBoard:
		return 4
	case StatusCompleted, StatusExecFailed, StatusFailed, StatusCancelled,
		StatusRejectedRange, StatusRejectedConstraint, StatusRejectedInhibited, StatusRejectedInterlock:
		return 9
	}
	return -1
}

// RawCommand is the inbound telecommand submitted via Command Gateway
type RawCommand struct {
	CommandID   string         `json:"command_id"` // UUID v7
	SCID        uint16         `json:"scid"`
	APID        uint16         `json:"apid"`
	Priority    Priority       `json:"priority"`
	Params      map[string]any `json:"params"`
	OperatorID  string         `json:"operator_id"`
	BypassCOP1  bool           `json:"bypass_cop1"`
	SubmittedAt time.Time      `json:"submitted_at"`
}

// TCSpacePacket is the encrypted, sequenced TC packet ready for UTFE
type TCSpacePacket struct {
	CommandID  string    `json:"command_id"`
	SCID       uint16    `json:"scid"`
	APID       uint16    `json:"apid"`
	Priority   Priority  `json:"priority"`
	SeqCount   uint16    `json:"seq_count"` // from etcd CAS
	IV         []byte    `json:"iv_b64"`    // 12 bytes AES-GCM IV
	Ciphertext []byte    `json:"ciphertext_b64"`
	GCMTag     []byte    `json:"gcm_tag_b64"` // 16 bytes auth tag
	BypassCOP1 bool      `json:"bypass_cop1"`
	BuiltAt    time.Time `json:"built_at"`
}

// CommandAckEvent represents a command state change event published on cmd.ack.events
type CommandAckEvent struct {
	CommandID     string        `json:"command_id"`
	SCID          uint16        `json:"scid"`
	Status        CommandStatus `json:"status"`
	SeqCount      uint16        `json:"seq_count"`
	ReportValueVR uint8         `json:"report_value_vr"`
	Timestamp     time.Time     `json:"timestamp"`
	Reason        string        `json:"reason,omitempty"`
}
