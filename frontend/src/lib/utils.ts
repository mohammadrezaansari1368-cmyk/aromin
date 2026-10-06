import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** اعداد فارسی با جداکنندهٔ هزارگان. */
export const fa = (n: number) => n.toLocaleString('fa-IR')
