package linkgateway

import (
	"context"
	"net"
	"time"
)

// TCPAdapter accepts frame-bearing TCP connections and forwards each read as
// one RawUnit.
type TCPAdapter struct {
	Addr string
	// FrameLength, when > 0, enables ASM frame sync: the stream is cut into
	// fixed-length frames of this many bytes (including the ASM). Zero keeps
	// the legacy behaviour of one unit per read.
	FrameLength int
}

func (a *TCPAdapter) Name() string { return "tcp:" + a.Addr }

func (a *TCPAdapter) Start(ctx context.Context, out chan<- RawUnit) error {
	l, err := net.Listen("tcp", a.Addr)
	if err != nil {
		return err
	}
	defer l.Close()

	go func() {
		<-ctx.Done()
		_ = l.Close()
	}()

	for {
		conn, err := l.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				return nil
			default:
				time.Sleep(100 * time.Millisecond)
				continue
			}
		}
		go a.handleConn(ctx, conn, out)
	}
}

func (a *TCPAdapter) handleConn(ctx context.Context, conn net.Conn, out chan<- RawUnit) {
	defer conn.Close()
	buf := make([]byte, 4096)
	var deframer *Deframer
	if a.FrameLength > 0 {
		deframer = NewDeframer(a.FrameLength)
	}
	for {
		select {
		case <-ctx.Done():
			return
		default:
			n, err := conn.Read(buf)
			if err != nil {
				return
			}
			if n == 0 {
				continue
			}
			if deframer == nil {
				emit(out, a.Name(), buf[:n])
				continue
			}
			for _, frame := range deframer.Push(buf[:n]) {
				emit(out, a.Name(), frame)
			}
		}
	}
}

// UDPAdapter reads one RawUnit per datagram.
type UDPAdapter struct {
	Addr string
}

func (a *UDPAdapter) Name() string { return "udp:" + a.Addr }

func (a *UDPAdapter) Start(ctx context.Context, out chan<- RawUnit) error {
	addr, err := net.ResolveUDPAddr("udp", a.Addr)
	if err != nil {
		return err
	}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return err
	}
	defer conn.Close()

	go func() {
		<-ctx.Done()
		_ = conn.Close()
	}()

	buf := make([]byte, 2048)
	for {
		n, _, err := conn.ReadFrom(buf)
		if err != nil {
			select {
			case <-ctx.Done():
				return nil
			default:
				continue
			}
		}
		if n > 0 {
			emit(out, a.Name(), buf[:n])
		}
	}
}

func emit(out chan<- RawUnit, adapterName string, payload []byte) {
	cp := make([]byte, len(payload))
	copy(cp, payload)
	out <- RawUnit{SourceAdapter: adapterName, ReceivedAtNs: nowNs(), Payload: cp}
}
