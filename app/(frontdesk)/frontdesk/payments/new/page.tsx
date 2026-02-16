import { requireRole } from '@/lib/auth/session'
import PaymentForm from '@/components/frontdesk/PaymentForm'

export default async function NewPaymentPage() {
  await requireRole('frontdesk')

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Record Payment
        </h1>
        <p className="text-gray-600">
          Collect consultation fee and issue receipt
        </p>
      </div>

      {/* Payment Form */}
      <PaymentForm />
    </div>
  )
}
