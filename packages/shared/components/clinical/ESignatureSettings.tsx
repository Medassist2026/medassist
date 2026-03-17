'use client'

import { useState, useEffect, useRef } from 'react'

// ============================================================================
// TYPES
// ============================================================================

export interface SignatureData {
  type: 'text' | 'image'
  textName?: string
  imageUrl?: string
}

export interface ClinicStampData {
  imageUrl?: string
}

interface ESignatureSettingsProps {
  onSave: (signature: SignatureData, stamp?: ClinicStampData) => void
  onClose: () => void
  initialSignature?: SignatureData
  initialStamp?: ClinicStampData
  doctorName: string
}

// ============================================================================
// E-SIGNATURE SETTINGS COMPONENT
// ============================================================================

export function ESignatureSettings({
  onSave,
  onClose,
  initialSignature,
  initialStamp,
  doctorName,
}: ESignatureSettingsProps) {
  const [sigType, setSigType] = useState<'text' | 'image'>(initialSignature?.type || 'text')
  const [sigImage, setSigImage] = useState<string | null>(initialSignature?.imageUrl || null)
  const [stampImage, setStampImage] = useState<string | null>(initialStamp?.imageUrl || null)
  const sigFileRef = useRef<HTMLInputElement>(null)
  const stampFileRef = useRef<HTMLInputElement>(null)

  const handleSigUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setSigImage(ev.target?.result as string)
      setSigType('image')
    }
    reader.readAsDataURL(file)
  }

  const handleStampUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setStampImage(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = () => {
    const signature: SignatureData = sigType === 'image' && sigImage
      ? { type: 'image', imageUrl: sigImage }
      : { type: 'text', textName: doctorName }

    const stamp: ClinicStampData | undefined = stampImage
      ? { imageUrl: stampImage }
      : undefined

    onSave(signature, stamp)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="bg-white rounded-t-[20px] w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#E5E7EB]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5E7EB]">
          <h3 className="font-cairo font-bold text-[16px] text-[#030712]">التوقيع الإلكتروني</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center">
            <svg className="w-4 h-4 text-[#4B5563]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Signature Type Selection */}
          <div>
            <label className="font-cairo text-[13px] font-semibold text-[#030712] mb-3 block">نوع التوقيع</label>
            <div className="flex gap-3">
              <button
                onClick={() => setSigType('text')}
                className={`flex-1 py-3 rounded-[12px] border font-cairo text-[13px] font-medium transition-colors ${
                  sigType === 'text'
                    ? 'bg-[#DCFCE7] border-[#16A34A] text-[#16A34A]'
                    : 'bg-white border-[#E5E7EB] text-[#4B5563]'
                }`}
              >
                توقيع نصي
              </button>
              <button
                onClick={() => setSigType('image')}
                className={`flex-1 py-3 rounded-[12px] border font-cairo text-[13px] font-medium transition-colors ${
                  sigType === 'image'
                    ? 'bg-[#DCFCE7] border-[#16A34A] text-[#16A34A]'
                    : 'bg-white border-[#E5E7EB] text-[#4B5563]'
                }`}
              >
                صورة التوقيع
              </button>
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="font-cairo text-[13px] font-semibold text-[#030712] mb-2 block">معاينة</label>
            <div className="border border-[#E5E7EB] rounded-[12px] p-4 bg-[#F9FAFB] min-h-[80px] flex items-center justify-center">
              {sigType === 'text' ? (
                <span
                  className="text-[24px] text-[#030712]"
                  style={{ fontFamily: "'Aref Ruqaa', 'Cairo', serif" }}
                >
                  د. {doctorName}
                </span>
              ) : sigImage ? (
                <img src={sigImage} alt="التوقيع" className="max-h-[60px] object-contain" />
              ) : (
                <span className="font-cairo text-[13px] text-[#9CA3AF]">لم يتم رفع صورة</span>
              )}
            </div>
          </div>

          {/* Upload signature image */}
          {sigType === 'image' && (
            <div>
              <button
                onClick={() => sigFileRef.current?.click()}
                className="w-full py-3 border border-dashed border-[#16A34A] rounded-[12px] font-cairo text-[13px] font-medium text-[#16A34A] hover:bg-[#F0FDF4] transition-colors"
              >
                ارفع صورة توقيعك
              </button>
              <input
                ref={sigFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleSigUpload}
              />
              <p className="font-cairo text-[11px] text-[#9CA3AF] mt-1">PNG أو JPG — يفضل خلفية بيضاء</p>
            </div>
          )}

          {/* Clinic Stamp (Separate) */}
          <div className="border-t border-[#E5E7EB] pt-4">
            <label className="font-cairo text-[13px] font-semibold text-[#030712] mb-2 block">ختم العيادة (اختياري)</label>
            <p className="font-cairo text-[11px] text-[#4B5563] mb-3">
              يظهر بجانب التوقيع في الروشتة المطبوعة
            </p>

            {stampImage ? (
              <div className="border border-[#E5E7EB] rounded-[12px] p-3 bg-[#F9FAFB] flex items-center justify-between">
                <img src={stampImage} alt="ختم العيادة" className="max-h-[50px] object-contain" />
                <button
                  onClick={() => setStampImage(null)}
                  className="font-cairo text-[12px] text-[#DC2626] font-medium"
                >
                  إزالة
                </button>
              </div>
            ) : (
              <button
                onClick={() => stampFileRef.current?.click()}
                className="w-full py-3 border border-dashed border-[#E5E7EB] rounded-[12px] font-cairo text-[13px] font-medium text-[#4B5563] hover:bg-[#F9FAFB] transition-colors"
              >
                ارفع صورة ختم العيادة
              </button>
            )}
            <input
              ref={stampFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleStampUpload}
            />
          </div>
        </div>

        {/* Save button */}
        <div className="px-5 py-4 border-t border-[#E5E7EB]">
          <button
            onClick={handleSave}
            className="w-full py-3.5 bg-[#16A34A] text-white rounded-[12px] font-cairo font-bold text-[14px] hover:bg-[#15803d] transition-colors"
          >
            حفظ التوقيع
          </button>
        </div>
      </div>
    </div>
  )
}
