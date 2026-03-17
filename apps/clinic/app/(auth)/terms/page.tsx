'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

export default function TermsPage() {
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
            شروط الاستخدام
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-5 space-y-4">
          <p className="font-cairo text-[12px] text-[#9CA3AF]">آخر تحديث: ١ يناير ٢٠٢٦</p>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">١. مقدمة</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              مرحبًا بك في MedAssist. باستخدامك لهذا التطبيق، فإنك توافق على الالتزام بهذه الشروط والأحكام. يرجى قراءتها بعناية قبل استخدام الخدمة.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">٢. وصف الخدمة</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              MedAssist هو نظام إدارة عيادات طبية يتيح للأطباء وموظفي الاستقبال إدارة المواعيد، سجلات المرضى، الوصفات الطبية، والمدفوعات. التطبيق مصمم للعيادات في مصر ويدعم اللغة العربية بالكامل.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">٣. حسابات المستخدمين</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              أنت مسؤول عن الحفاظ على سرية بيانات حسابك وكلمة المرور. يجب أن تكون المعلومات المقدمة عند التسجيل صحيحة ودقيقة. يحق لنا تعليق أو إنهاء حسابك في حالة مخالفة هذه الشروط.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">٤. البيانات الطبية</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              البيانات الطبية المُدخلة هي مسؤولية الطبيب المعالج. MedAssist لا يقدم استشارات طبية ولا يتحمل مسؤولية القرارات الطبية المبنية على البيانات المسجلة في النظام.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">٥. الاستخدام المقبول</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              يُسمح باستخدام التطبيق لأغراض إدارة العيادات الطبية فقط. يُحظر استخدام التطبيق لأي غرض غير قانوني أو محاولة الوصول غير المصرح به إلى بيانات مستخدمين آخرين.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">٦. تحديد المسؤولية</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              يُقدم التطبيق "كما هو" دون ضمانات صريحة أو ضمنية. لا نتحمل المسؤولية عن أي أضرار مباشرة أو غير مباشرة ناتجة عن استخدام التطبيق أو عدم القدرة على استخدامه.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">٧. التعديلات</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              نحتفظ بحق تعديل هذه الشروط في أي وقت. سيتم إخطارك بالتغييرات الجوهرية عبر التطبيق. استمرارك في استخدام الخدمة بعد التعديل يُعد قبولاً للشروط المُحدّثة.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-cairo text-[15px] font-bold text-[#030712]">٨. الاتصال</h2>
            <p className="font-cairo text-[13px] text-[#4B5563] leading-relaxed">
              للاستفسارات حول هذه الشروط، يمكنك التواصل معنا عبر البريد الإلكتروني: support@medassist.app
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
