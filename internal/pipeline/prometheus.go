package pipeline

import "github.com/prometheus/client_golang/prometheus"

// Collector exports the pipeline counters and latency to Prometheus, so a
// monitoring system sees the same per-stage numbers as the Simulator Lab:
//
//	vyuh_pipeline_events_total{stage="frame",event="crc_error"} 13
//	vyuh_pipeline_latency_ms{path="ert_to_ws",quantile="0.95"}  36.1
func Collector() prometheus.Collector { return collector{} }

type collector struct{}

var (
	eventsDesc  = prometheus.NewDesc("vyuh_pipeline_events_total", "Units a pipeline stage counted, by stage and event.", []string{"stage", "event"}, nil)
	latencyDesc = prometheus.NewDesc("vyuh_pipeline_latency_ms", "Recent latency quantiles in milliseconds, by path.", []string{"path", "quantile"}, nil)
)

func (collector) Describe(ch chan<- *prometheus.Desc) {
	ch <- eventsDesc
	ch <- latencyDesc
}

func (collector) Collect(ch chan<- prometheus.Metric) {
	s := Take()
	for stage, events := range s.Stages {
		for event, n := range events {
			ch <- prometheus.MustNewConstMetric(eventsDesc, prometheus.CounterValue, float64(n), stage, event)
		}
	}
	for path, l := range s.Latency {
		for q, v := range map[string]float64{"0.5": l.P50, "0.95": l.P95, "0.99": l.P99, "1": l.Max} {
			ch <- prometheus.MustNewConstMetric(latencyDesc, prometheus.GaugeValue, v, path, q)
		}
	}
}
