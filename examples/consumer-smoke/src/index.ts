import { createLogger, getSdkVersion } from '@umbrelog/sdk';

const logger = createLogger({
  service: 'consumer-smoke',
  env: 'test',
  hardDisableNetwork: true,
});

logger.info('Consumer smoke test initialized', { sdkVersion: getSdkVersion() });

console.log('OK: @umbrelog/sdk consumer smoke test passed');
