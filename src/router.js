const routes = {}

export function register(path, handler) {
  routes[path] = handler
}

export function navigate(path) {
  window.location.hash = path
}

export function start() {
  window.addEventListener('hashchange', resolve)
  resolve()
}

function resolve() {
  const hash = window.location.hash.slice(1) || '/'
  const handler = routes[hash] ?? routes['/']
  if (handler) handler()
}
