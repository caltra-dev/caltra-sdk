/** Sprite's edge owns Authorization. Its private preview gateway restores the API bearer header. */
export class TestAppPreviewFetch {
  static readonly fetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const target = new URL(request.url);
    // Only the same-origin development gateway uses this contract. Public Caltra
    // endpoints and production embeds retain the standard Authorization header.
    if (target.origin === window.location.origin && target.hostname.endsWith(".sprites.app")) {
      const authorization = request.headers.get("authorization");
      if (authorization) {
        request.headers.set("x-preview-authorization", authorization);
        request.headers.delete("authorization");
      }
    }
    return await globalThis.fetch(request);
  };
}
