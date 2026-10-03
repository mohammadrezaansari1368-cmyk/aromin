/**
 * منبعِ دادهٔ آمپرهای «استارلایت» (B22–B32).
 * فعلاً فقط شبیه‌ساز (مطابقِ بستهٔ طراحی)؛ اتصال به دادهٔ واقعی = عوض کردنِ بدنهٔ useStarlightData — نه کاشی‌ها.
 */

import { useEffect, useRef, useState } from 'react'

export type StarlightData = { speed: number; rpm: number; power: number; battery: number; range: number; motorTemp: number; fuel: number; cabin: number; now: Date; live: boolean }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const INITIAL: StarlightData = { speed: 0, rpm: 800, battery: 82, range: 0, motorTemp: 38, fuel: 64, cabin: 21.5, power: 0, now: new Date(), live: false }

/** شبیه‌سازِ بستهٔ طراحی: هر ۲۵۰ میلی‌ثانیه یک گام */
function step(s: StarlightData, target: number): StarlightData {
	const speed = clamp(s.speed + clamp(target - s.speed, -3, 2.2) + (Math.random() - 0.5), 0, 250)
	const accel = target > s.speed ? 1 : 0.2
	const gear = speed < 20 ? 1 : speed < 45 ? 2 : speed < 75 ? 3 : speed < 110 ? 4 : speed < 150 ? 5 : 6
	const rpm = speed < 1 ? 800 : clamp(800 + (speed / [0, 20, 45, 75, 110, 150, 250][gear]) * 4200 + accel * 600, 800, 6800)
	const battery = clamp(s.battery - 0.004 * accel - speed * 0.00002, 5, 100)
	return {
		now: new Date(), live: false, speed, rpm, battery,
		power: clamp(s.power + (accel * 60 + speed * 0.25 - s.power) * 0.15, 0, 100),
		range: battery * 4.6 + s.fuel * 6.5,
		fuel: clamp(s.fuel - speed * 0.00003, 0, 100),
		motorTemp: s.motorTemp + (45 + speed * 0.18 + accel * 8 - s.motorTemp) * 0.01,
		cabin: s.cabin + (21 - s.cabin) * 0.01 + (Math.random() - 0.5) * 0.02,
	}
}

export function useStarlightData(): StarlightData {
	const [d, setD] = useState(INITIAL)
	const target = useRef(60)
	useEffect(() => {
		const id = setInterval(() => {
			if (document.hidden) return
			if (Math.random() < 0.02) target.current = [0, 40, 70, 110, 140][Math.floor(Math.random() * 5)]
			setD((s) => step(s, target.current))
		}, 250)
		return () => clearInterval(id)
	}, [])
	return d
}
