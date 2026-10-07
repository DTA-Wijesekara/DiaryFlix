// GIS requires one initialization per document, including React StrictMode mounts.
// Keep the registry on window so Vite hot reload does not initialize GIS again.
export function renderGoogleButton(clientId, container, handlers) {
  const api = window.google?.accounts?.id;
  if (!api) return null;
  let registry = window.__diaryflixGoogleIdentity;
  if (!registry) {
    registry = { clientId, receiver: null };
    api.initialize({
      client_id: clientId,
      ux_mode: 'popup',
      auto_select: false,
      callback(response) {
        if (response?.credential) registry.receiver?.onCredential(response.credential);
        else registry.receiver?.onError(new Error('No credential returned from Google'));
      },
    });
    window.__diaryflixGoogleIdentity = registry;
  }
  if (registry.clientId !== clientId) throw new Error('Google configuration changed. Reload this page.');
  registry.receiver = handlers;
  container.replaceChildren();
  api.renderButton(container, {
    type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
    shape: 'rectangular', logo_alignment: 'left', width: container.offsetWidth || 320,
  });
  return () => {
    if (registry.receiver === handlers) registry.receiver = null;
    container.replaceChildren();
  };
}
