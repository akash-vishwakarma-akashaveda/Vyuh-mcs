# Dockerfile — shared multi-stage container build for all VYUH-MCS Go microservices
FROM golang:1.22-alpine AS builder

ARG SERVICE
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o /bin/service ./cmd/${SERVICE}/

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /bin/service /service
USER nonroot:nonroot
EXPOSE 8080 9090
ENTRYPOINT ["/service"]
