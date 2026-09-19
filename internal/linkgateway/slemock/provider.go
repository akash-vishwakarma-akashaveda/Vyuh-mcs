// Package slemock is an in-repo mock SLE provider that speaks the same
// BIND/START/TRANSFER-DATA/STOP/UNBIND procedure as internal/linkgateway/sle,
// so the real SLEAdapter can be exercised end-to-end without a live ground
// station provider (see the backend plan's flagged substitutions). Swapping
// this mock's address for a real provider's later is a config change to the
// adapter, not a code change.
package slemock

import (
	"context"
	"net"

	"github.com/akashaveda/vyuh-mcs/internal/linkgateway/sle"
)

// Provider is a minimal RAF-like SLE responder. Frames pushed to Frames are
// delivered as TRANSFER-DATA once a session has BIND+START'd.
type Provider struct {
	Frames chan []byte
}

func NewProvider() *Provider {
	return &Provider{Frames: make(chan []byte, 256)}
}

func (p *Provider) Listen(addr string) (net.Listener, error) {
	return net.Listen("tcp", addr)
}

// Serve accepts one session at a time (a mock provider only needs to prove
// the protocol works, not handle concurrent operators) until ctx is done.
func (p *Provider) Serve(ctx context.Context, l net.Listener) {
	go func() {
		<-ctx.Done()
		_ = l.Close()
	}()

	for {
		conn, err := l.Accept()
		if err != nil {
			return
		}
		p.handleSession(ctx, conn)
	}
}

func (p *Provider) handleSession(ctx context.Context, conn net.Conn) {
	defer conn.Close()

	tag, fields, err := sle.ReadPDU(conn)
	if err != nil || tag != sle.TagBindInvocation {
		return
	}
	if _, err := sle.DecodeBindInvocation(fields); err != nil {
		return
	}
	if err := sle.WritePDU(conn, sle.TagBindReturn, sle.EncodeBindReturn(sle.BindReturn{Result: sle.ResultPositive})); err != nil {
		return
	}

	tag, fields, err = sle.ReadPDU(conn)
	if err != nil || tag != sle.TagStartInvocation {
		return
	}
	if _, err := sle.DecodeStartInvocation(fields); err != nil {
		return
	}
	if err := sle.WritePDU(conn, sle.TagStartReturn, sle.EncodeStartReturn(sle.StartReturn{Result: sle.ResultPositive})); err != nil {
		return
	}

	stopped := make(chan struct{})
	go p.deliverFrames(ctx, conn, stopped)

	// Wait for STOP, reply, then wait for UNBIND, reply, done.
	tag, _, err = sle.ReadPDU(conn)
	close(stopped)
	if err != nil || tag != sle.TagStopInvocation {
		return
	}
	if err := sle.WritePDU(conn, sle.TagStopReturn, sle.EncodeStopReturn(sle.StopReturn{Result: sle.ResultPositive})); err != nil {
		return
	}

	tag, _, err = sle.ReadPDU(conn)
	if err != nil || tag != sle.TagUnbindInvocation {
		return
	}
	_ = sle.WritePDU(conn, sle.TagUnbindReturn, sle.EncodeUnbindReturn(sle.UnbindReturn{Result: sle.ResultPositive}))
}

func (p *Provider) deliverFrames(ctx context.Context, conn net.Conn, stop <-chan struct{}) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-stop:
			return
		case frame := <-p.Frames:
			_ = sle.WritePDU(conn, sle.TagTransferData, sle.EncodeTransferData(sle.TransferData{
				AntennaID: "MOCK-SLE", Radiated: true, Frame: frame,
			}))
		}
	}
}
