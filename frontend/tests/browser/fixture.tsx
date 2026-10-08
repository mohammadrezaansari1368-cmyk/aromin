import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import LedgerPage from '../../src/components/ledger/LedgerPage'
import GoogleSettings from '../../src/components/agent/GoogleSettings'
import ImportPage from '../../src/components/ImportPage'
import Funnel from '../../src/components/ui/funnel-chart'
const query = new URLSearchParams(location.search)
const session = { user: 'test', name: 'آزمایش', pass: 'test-only', role: query.get('role') === 'sales' ? 'sales' as const : 'manager' as const }
function ChartFixture() {
 const brand = query.get('brand') === '1'
 const colors = ['#004991', '#910D6A', '#FCBF00'] as const
 const [v, setV] = useState([100, 60, 30, 10])
 return <div style={{width:'min(90vw,380px)',margin:'auto'}}><button onClick={()=>setV([100,80,50,20])}>تغییر داده</button><Funnel colors={brand ? colors : undefined} legend={brand} data={(brand ? v.slice(0, 3) : v).map((value,i)=>({key:String(i),label:`مرحله ${i+1}`,value}))} /></div>
}
createRoot(document.getElementById('root')!).render(query.get('view') === 'google' ? <GoogleSettings session={session} /> : query.get('view') === 'funnel' ? <ChartFixture /> : query.get('view') === 'import' ? <ImportPage session={session} /> : <LedgerPage session={session} />)
