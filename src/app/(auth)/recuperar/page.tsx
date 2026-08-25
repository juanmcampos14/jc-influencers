import type { Metadata } from 'next'
import { RecoverForm } from './recover-form'

export const metadata: Metadata = { title: 'Recuperar acceso' }

export default function RecoverPage() {
  return <RecoverForm />
}
