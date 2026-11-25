import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { startupWarnings } from './startup.js'

const config = loadConfig()
const app = buildApp({ logger: true, config, startScheduler: true })

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down')
  try {
    await app.close()
    process.exit(0)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])
if (!LOOPBACK_HOSTS.has(config.HOST)) {
  // Bearer tokens are only protected in transit when TLS is terminated upstream.
  app.log.warn({ host: config.HOST }, 'API bound to a non-loopback host: put it behind HTTPS')
}

for (const warning of startupWarnings(config)) app.log.warn(warning)

try {
  await app.listen({ port: config.PORT, host: config.HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
