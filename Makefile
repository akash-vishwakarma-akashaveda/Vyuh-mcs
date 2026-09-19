.PHONY: test build clean

SERVICES := link-gateway frame-processor tm-processor mission-database live-telemetry realtime-gateway command-gateway upe utfe bff alarm-manager gap-replay dead-letter-monitor simulator vyuh-mcs

test:
	go test ./pkg/... ./internal/... ./cmd/... -v

build:
	@mkdir -p bin
	@for svc in $(SERVICES); do \
		echo "Building $$svc..."; \
		go build -o bin/$$svc ./cmd/$$svc; \
	done

clean:
	rm -rf bin/
