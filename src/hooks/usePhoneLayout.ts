import { useEffect, useState } from 'react'

const PHONE_LAYOUT = '(max-width: 700px), (max-width: 1000px) and (max-height: 500px)'

export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE_LAYOUT).matches)
  useEffect(() => {
    const query = window.matchMedia(PHONE_LAYOUT)
    const update = () => setPhone(query.matches)
    query.addEventListener('change', update)
    update()
    return () => query.removeEventListener('change', update)
  }, [])
  return phone
}
