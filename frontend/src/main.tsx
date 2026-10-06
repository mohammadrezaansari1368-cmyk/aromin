import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// بازبینیِ img2threejs برای نشانِ دستیار — جدا بارگذاری می‌شود (three در بستهٔ اصلی نیاید)
const AgentPreview = lazy(() => import('@/components/agent/AgentPreview'))
const Emblem3D = lazy(() => import('@/components/login/emblem/Emblem3D'))

// ?emblem-preview → فقط نشانِ سه‌بعدی از روبه‌رو روی زمینهٔ سفید (برای بازبینیِ img2threejs در برابرِ لوگوی مرجع)
const qs = new URLSearchParams(location.search)
const preview = qs.has('emblem-preview')
const pv = (qs.get('view') as 'front' | 'three-quarter' | 'side' | null) ?? 'front'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {qs.has('agent-preview') ? (
      <div style={{ margin: 0, overflow: 'hidden' }}><Suspense fallback={null}><AgentPreview /></Suspense></div>
    ) : preview ? (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#fff', overflow: 'hidden' }}>
        <Suspense fallback={null}>{qs.has('hero') ? <Emblem3D mode="hero" size={300} /> : <Emblem3D mode="front" size={360} view={pv} fitRef={qs.has('fit')} stripped={qs.has('stripped')} />}</Suspense>
      </div>
    ) : (
      <App />
    )}
  </StrictMode>,
)
