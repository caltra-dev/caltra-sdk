/** Provides upstream credentials for a Caltra workspace exchange. The token cache is isolated
 * by the credential returned for the current signed-in session on each request. */
export interface CaltraAuthProvider {
  /** Read fresh session state. A signed-out host must reject before any Caltra request. */
  getSessionToken(): Promise<string>;
  /** Exchange through the configured Caltra API origin and the provider's workspace selector. */
  exchange(apiUrl: string, token: string, fetchImplementation: typeof fetch): Promise<Response>;
}
