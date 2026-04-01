export interface ReminderContext {
  patientName: string
  doctorName?: string
  clinicName?: string
  appointmentDate?: string
  appointmentTime?: string
  testName?: string
}

export const reminderTemplates = {
  appointment_reminder: (ctx: ReminderContext) => ({
    en: `MedAssist: Hi ${ctx.patientName}, reminder for your appointment with Dr. ${ctx.doctorName} on ${ctx.appointmentDate} at ${ctx.appointmentTime}. ${ctx.clinicName}`,
    ar: `MedAssist: مرحبًا ${ctx.patientName}، تذكير بموعدك مع د. ${ctx.doctorName} يوم ${ctx.appointmentDate} الساعة ${ctx.appointmentTime}. ${ctx.clinicName}`,
  }),

  appointment_confirmed: (ctx: ReminderContext) => ({
    en: `MedAssist: Hi ${ctx.patientName}, your appointment with Dr. ${ctx.doctorName} on ${ctx.appointmentDate} at ${ctx.appointmentTime} has been confirmed. ${ctx.clinicName}`,
    ar: `MedAssist: مرحبًا ${ctx.patientName}، تم تأكيد موعدك مع د. ${ctx.doctorName} يوم ${ctx.appointmentDate} الساعة ${ctx.appointmentTime}. ${ctx.clinicName}`,
  }),

  followup: (ctx: ReminderContext) => ({
    en: `MedAssist: Hi ${ctx.patientName}, it's time for your follow-up visit with Dr. ${ctx.doctorName}. Please book an appointment. ${ctx.clinicName}`,
    ar: `MedAssist: مرحبًا ${ctx.patientName}، حان موعد زيارة المتابعة مع د. ${ctx.doctorName}. يرجى حجز موعد. ${ctx.clinicName}`,
  }),

  lab_ready: (ctx: ReminderContext) => ({
    en: `MedAssist: Hi ${ctx.patientName}, your ${ctx.testName} results are ready. Please check your MedAssist app or visit ${ctx.clinicName}.`,
    ar: `MedAssist: مرحبًا ${ctx.patientName}، نتائج ${ctx.testName} جاهزة. يرجى مراجعة تطبيق MedAssist أو زيارة ${ctx.clinicName}.`,
  }),

  appointment_cancelled: (ctx: ReminderContext) => ({
    en: `MedAssist: Hi ${ctx.patientName}, your appointment with Dr. ${ctx.doctorName} on ${ctx.appointmentDate} at ${ctx.appointmentTime} has been cancelled. Please contact ${ctx.clinicName} to reschedule.`,
    ar: `MedAssist: مرحبًا ${ctx.patientName}، تم إلغاء موعدك مع د. ${ctx.doctorName} يوم ${ctx.appointmentDate} الساعة ${ctx.appointmentTime}. يرجى التواصل مع ${ctx.clinicName} لإعادة الحجز.`,
  }),

  custom: (ctx: ReminderContext & { message: string }) => ({
    en: ctx.message,
    ar: ctx.message,
  }),
}
