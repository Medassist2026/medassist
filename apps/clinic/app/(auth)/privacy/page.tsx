'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

export default function PrivacyPage() {
  const router = useRouter()

  return (
    <div dir="rtl" className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#E5E7EB]">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 max-w-md mx-auto">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center flex-shrink-0"
          >
            <ChevronRight className="w-5 h-5 text-[#030712]" />
          </button>
          <h1 className="font-cairo text-[18px] font-semibold text-[#030712]">
            سياسة الخصوصية
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-5 space-y-4">
          <p className="font-cairo text-[12px] text-[#9CA3AF]">آخر تحديث: ١ يناير ٢٠٢٦</p>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">١. البيانات التي نجمعها</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              نجمع البيانات التالية عند استخدامك للتطبيق: الاسم الكامل، رقم الهاتف المصري، الدور (طبيب/استقبال)، وبيانات العيادة. بالنسبة لسجلات المرضى: الاسم، العمر، النوع، رقم الهاتف، التاريخ الطبي، والوصفات الطبية.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">٢. كيف نستخدم بياناتك</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              نستخدم بياناتك لتقديم خدمات إدارة العيادة، بما في ذلك: إدارة المواعيد، حفظ السجلات الطبية، تذكيرات المواعيد عبر الرسائل القصيرة، وإصدار التقارير. لا نبيع أو نشارك بياناتك مع أطراف ثالثة لأغراض تسويقية.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">٣. حماية البيانات</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              نستخدم تشفير SSL/TLS لحماية البيانات أثناء النقل. يتم تخزين البيانات بشكل آمن في قواعد بيانات محمية مع صلاحيات وصول مقيدة (Row Level Security). الأطباء لا يمكنهم الوصول إلا لبيانات مرضاهم فقط.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">٤. الرسائل القصيرة (SMS)</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              نرسل رسائل تذكير بالمواعيد ورسائل إلغاء عبر أرقام الهاتف المسجلة. يمكن للمريض طلب إيقاف هذه الرسائل عبر العيادة. لا نرسل رسائل تسويقية.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">٥. حقوقك</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              لديك الحق في: الوصول إلى بياناتك الشخصية، طلب تصحيح البيانات غير الدقيقة، طلب حذف حسابك وبياناتك، الحصول على نسخة من بياناتك. لممارسة هذه الحقوق، تواصل معنا عبر support@medassist.app.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">٦. الاحتفاظ بالبيانات</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              نحتفظ ببيانات السجلات الطبية طوال فترة نشاط حساب الطبيب وحسب المتطلبات القانونية المصرية لحفظ السجلات الطبية. عند حذف الحساب، يتم حذف البيانات الشخصية مع الاحتفاظ بالسجلات الطبية المُجهلة حسب المتطلبات القانونية.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">٧. ملفات تعريف الارتباط</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              نستخدم ملفات تعريف الارتباط (Cookies) لإدارة جلسات المستخدم والمصادقة فقط. لا نستخدم ملفات تتبع لأغراض إعلانية.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">٨. الاتصال</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              للاستفسارات حول سياسة الخصوصية: support@medassist.app
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
