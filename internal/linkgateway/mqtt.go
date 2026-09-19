package linkgateway

import (
	"context"
	"fmt"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

// MQTTAdapter subscribes to a broker topic that carries one frame per
// message payload (FR-LGW-01: MQTT/REST delivery).
type MQTTAdapter struct {
	BrokerURL string // e.g. tcp://localhost:1883
	Topic     string
	ClientID  string
}

func (a *MQTTAdapter) Name() string { return "mqtt:" + a.Topic }

func (a *MQTTAdapter) Start(ctx context.Context, out chan<- RawUnit) error {
	opts := mqtt.NewClientOptions().
		AddBroker(a.BrokerURL).
		SetClientID(a.ClientID).
		SetAutoReconnect(true)

	name := a.Name()
	opts.SetDefaultPublishHandler(func(_ mqtt.Client, msg mqtt.Message) {
		payload := msg.Payload()
		cp := make([]byte, len(payload))
		copy(cp, payload)
		out <- RawUnit{SourceAdapter: name, ReceivedAtNs: nowNs(), Payload: cp}
	})

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		return fmt.Errorf("mqtt connect: %w", token.Error())
	}
	defer client.Disconnect(250)

	if token := client.Subscribe(a.Topic, 1, nil); token.Wait() && token.Error() != nil {
		return fmt.Errorf("mqtt subscribe %s: %w", a.Topic, token.Error())
	}

	<-ctx.Done()
	return nil
}
