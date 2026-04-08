import { init as initI18n } from './i18n/index.js'
import { register, start } from './router.js'
import { renderHome } from './pages/home.js'
import { renderScanner } from './pages/scanner.js'
import { renderViewer } from './pages/viewer.js'

import './styles/main.css'
import './styles/home.css'
import './styles/scanner.css'
import './styles/viewer.css'

const app = document.querySelector('#app')

initI18n()

register('/', () => renderHome(app))
register('/scanner', () => renderScanner(app))
register('/viewer', () => renderViewer(app))

start()
