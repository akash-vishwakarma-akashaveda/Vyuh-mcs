package sle

import (
	"context"
	"fmt"
	"net"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/linkgateway"
)

// Adapter is a Link Gateway Transport Adapter that runs the SLE RAF service
// procedure against a provider (or, in this environment, the in-repo mock in
// sibling package slemock — see mock.go). It satisfies linkgateway.Adapter.
type Adapter struct {
	ProviderAddr string
	InitiatorID  string
	Service      ServiceType
	AntennaID    string

	// DialTimeout bounds the initial connection; Reconnect controls whether
	// a lost session is retried with jittered backoff (§15.2's "reconnect
	// with jittered backoff (100 ms -> 5 s during passes)").
	DialTimeout time.Duration
}

func (a *Adapter) Name() string { return "sle:" + a.ProviderAddr }

func (a *Adapter) Start(ctx context.Context, out chan<- linkgateway.RawUnit) error {
	backoff := 100 * time.Millisecond
	const maxBackoff = 5 * time.Second

	for {
		if err := a.runSession(ctx, out); err != nil {
			select {
			case <-ctx.Done():
				return nil
			case <-time.After(backoff):
			}
			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
			continue
		}
		backoff = 100 * time.Millisecond
		select {
		case <-ctx.Done():
			return nil
		default:
		}
	}
}

func (a *Adapter) runSession(ctx context.Context, out chan<- linkgateway.RawUnit) error {
	dialTimeout := a.DialTimeout
	if dialTimeout <= 0 {
		dialTimeout = 5 * time.Second
	}
	d := net.Dialer{Timeout: dialTimeout}
	conn, err := d.DialContext(ctx, "tcp", a.ProviderAddr)
	if err != nil {
		return fmt.Errorf("sle dial %s: %w", a.ProviderAddr, err)
	}
	defer conn.Close()

	go func() {
		<-ctx.Done()
		_ = conn.Close()
	}()

	// BIND
	if err := WritePDU(conn, TagBindInvocation, EncodeBindInvocation(BindInvocation{
		InitiatorID: a.InitiatorID, Service: a.Service, Version: 1,
	})); err != nil {
		return fmt.Errorf("sle bind: %w", err)
	}
	tag, fields, err := ReadPDU(conn)
	if err != nil {
		return fmt.Errorf("sle bind-return read: %w", err)
	}
	if tag != TagBindReturn {
		return fmt.Errorf("sle bind-return: unexpected pdu tag %#x", tag)
	}
	br, err := DecodeBindReturn(fields)
	if err != nil || br.Result != ResultPositive {
		return fmt.Errorf("sle bind rejected: %s", br.Diagnostic)
	}

	// START
	if err := WritePDU(conn, TagStartInvocation, EncodeStartInvocation(StartInvocation{})); err != nil {
		return fmt.Errorf("sle start: %w", err)
	}
	tag, fields, err = ReadPDU(conn)
	if err != nil {
		return fmt.Errorf("sle start-return read: %w", err)
	}
	if tag != TagStartReturn {
		return fmt.Errorf("sle start-return: unexpected pdu tag %#x", tag)
	}
	sr, err := DecodeStartReturn(fields)
	if err != nil || sr.Result != ResultPositive {
		return fmt.Errorf("sle start rejected: %s", sr.Diagnostic)
	}

	defer a.stopAndUnbind(conn)

	// TRANSFER-DATA loop
	name := a.Name()
	for {
		tag, fields, err := ReadPDU(conn)
		if err != nil {
			return fmt.Errorf("sle transfer-data read: %w", err)
		}
		if tag != TagTransferData {
			continue
		}
		td, err := DecodeTransferData(fields)
		if err != nil {
			continue
		}
		out <- linkgateway.RawUnit{
			SourceAdapter: name,
			ReceivedAtNs:  td.EarthReceiveTimeNs,
			Payload:       td.Frame,
		}

		select {
		case <-ctx.Done():
			return nil
		default:
		}
	}
}

func (a *Adapter) stopAndUnbind(conn net.Conn) {
	_ = WritePDU(conn, TagStopInvocation, EncodeStopInvocation(StopInvocation{}))
	_, _, _ = ReadPDU(conn) // STOP-RETURN, best-effort
	_ = WritePDU(conn, TagUnbindInvocation, EncodeUnbindInvocation(UnbindInvocation{Reason: 0}))
	_, _, _ = ReadPDU(conn) // UNBIND-RETURN, best-effort
}
