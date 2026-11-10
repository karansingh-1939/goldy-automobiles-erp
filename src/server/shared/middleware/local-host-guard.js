const allowedHostnames = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * Rejects requests whose Host header is not a loopback name.
 *
 * The API listens on 127.0.0.1 only, but a web page open in a browser on the
 * same laptop could rebind its own domain to 127.0.0.1 (DNS rebinding) and
 * gain same-origin access to the local API. Such requests carry the
 * attacker's domain in the Host header, so they are refused here.
 */
export function localHostGuard() {
  return (req, res, next) => {
    const host = (req.headers.host || '').toLowerCase();
    const hostname = host.startsWith('[')
      ? host.slice(0, host.indexOf(']') + 1)
      : host.split(':')[0];
    if (allowedHostnames.has(hostname)) return next();
    res.status(403).json({
      error: {
        code: 'HOST_NOT_ALLOWED',
        message: 'Requests must address the local workshop server.',
      },
    });
  };
}
