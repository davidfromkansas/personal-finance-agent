import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

export function getPlaidClient() {
  const clientId = process.env.PLAID_CLIENT_ID ?? ''
  const secret = process.env.PLAID_SECRET ?? ''
  const env = (process.env.PLAID_ENV || 'sandbox').toLowerCase()
  const basePath = env === 'production'
    ? PlaidEnvironments.production
    : env === 'development'
      ? PlaidEnvironments.development
      : PlaidEnvironments.sandbox
  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  })
  return new PlaidApi(configuration)
}
