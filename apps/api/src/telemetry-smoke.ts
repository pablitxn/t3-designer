import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { GenerationTelemetry, telemetryConfig } from './telemetry.ts'

async function main() {
  const config = telemetryConfig(process.env)
  if (!config) throw new Error('Set an OTLP endpoint and enable tracing before running the smoke check.')
  const exporter = new OTLPTraceExporter({ url: config.endpoint, headers: config.headers, timeoutMillis: 3000 })
  let delivered = 0, failed = false
  const runtime = new GenerationTelemetry({ ...config, exporter: {
    export: (spans, done) => exporter.export(spans, result => {
      if (result.code === 0) delivered += spans.length
      else failed = true
      done(result)
    }),
    shutdown: () => exporter.shutdown(),
  } })
  try {
    const identity = await runtime.smoke()
    await runtime.forceFlush()
    if (failed || delivered !== 2) throw new Error('The collector did not acknowledge the synthetic trace.')
    console.log(JSON.stringify({ ...identity, project: `${config.serviceName}.${config.environment}`, spans: delivered,
      synthetic: true, collectorAccepted: true, phoenixVerified: false }, null, 2))
  } finally { await runtime.shutdown() }
}

main().catch(error => {
  // Do not print exporter errors, URLs, headers or credential-bearing stacks.
  console.error(error instanceof Error && [
    'Set an OTLP endpoint and enable tracing before running the smoke check.',
    'The collector did not acknowledge the synthetic trace.',
  ].includes(error.message) ? error.message : 'Tracing smoke check failed. Check the private endpoint configuration.')
  process.exitCode = 1
})
