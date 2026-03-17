/**
 * Pure data exports for templates - safe to import from client components.
 * No server-side dependencies (no supabase, no next/headers).
 */

export interface ICD10Entry {
  code: string
  description: string
  aliases: string[]
}

export const ICD10_DATABASE: ICD10Entry[] = [
  // RESPIRATORY (J00-J99)
  { code: 'J00', description: 'Acute nasopharyngitis [common cold]', aliases: ['زكام', 'رشح', 'common cold'] },
  { code: 'J01.90', description: 'Acute sinusitis, unspecified', aliases: ['التهاب جيوب أنفية', 'sinusitis'] },
  { code: 'J02.9', description: 'Acute pharyngitis, unspecified', aliases: ['التهاب الحلق', 'pharyngitis', 'throat pain'] },
  { code: 'J03.90', description: 'Acute tonsillitis, unspecified', aliases: ['التهاب اللوزتين', 'tonsillitis'] },
  { code: 'J04.0', description: 'Acute laryngitis', aliases: ['التهاب الحنجرة', 'laryngitis', 'hoarseness'] },
  { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified', aliases: ['عدوى تنفسية عليا', 'URI'] },
  { code: 'J10.1', description: 'Influenza due to other identified influenza virus', aliases: ['إنفلونزا', 'flu', 'الإنفلونزا'] },
  { code: 'J11.1', description: 'Influenza due to unidentified influenza virus', aliases: ['إنفلونزا غير محددة', 'unidentified flu'] },
  { code: 'J12.9', description: 'Viral pneumonia, unspecified', aliases: ['الالتهاب الرئوي الفيروسي', 'viral pneumonia'] },
  { code: 'J13', description: 'Pneumonia due to Streptococcus pneumoniae', aliases: ['الالتهاب الرئوي', 'bacterial pneumonia'] },
  { code: 'J15.9', description: 'Bacterial pneumonia, unspecified', aliases: ['الالتهاب الرئوي البكتيري', 'pneumonia'] },
  { code: 'J18.9', description: 'Pneumonia, unspecified', aliases: ['ذات الرئة', 'chest infection'] },
  { code: 'J20.9', description: 'Acute bronchitis, unspecified', aliases: ['التهاب الشعب الهوائية', 'bronchitis'] },
  { code: 'J21.90', description: 'Bronchiolitis, unspecified', aliases: ['التهاب الشعيبات الهوائية', 'bronchiolitis'] },
  { code: 'J30.9', description: 'Allergic rhinitis, unspecified', aliases: ['التهاب الأنف التحسسي', 'allergic rhinitis', 'حساسية الأنف'] },
  { code: 'J45.901', description: 'Unspecified asthma with (acute) exacerbation', aliases: ['الربو', 'asthma', 'ربو'] },
  { code: 'J45.902', description: 'Unspecified asthma with status asthmaticus', aliases: ['نوبة ربو حادة', 'acute asthma'] },
  { code: 'J44.9', description: 'Chronic obstructive pulmonary disease, unspecified', aliases: ['الانسداد الرئوي المزمن', 'COPD'] },
  { code: 'J44.0', description: 'Chronic obstructive pulmonary disease with acute lower respiratory infection', aliases: ['COPD with infection'] },
  { code: 'R05.9', description: 'Fever, unspecified', aliases: ['حمى', 'fever', 'ارتفاع حرارة'] },
  { code: 'R06.00', description: 'Dyspnea, unspecified', aliases: ['ضيق التنفس', 'shortness of breath', 'صعوبة التنفس'] },
  { code: 'R06.02', description: 'Shortness of breath', aliases: ['قصر النفس'] },
  { code: 'R06.1', description: 'Stridor', aliases: ['صفير التنفس'] },
  { code: 'R05.0', description: 'Fever with chills', aliases: ['حمى مع رعشة'] },

  // GASTROINTESTINAL (K00-K99)
  { code: 'K21.9', description: 'Unspecified reflux esophagitis', aliases: ['الارتجاع المريئي', 'GERD', 'حموضة المعدة'] },
  { code: 'K29.70', description: 'Gastritis, unspecified', aliases: ['التهاب المعدة', 'gastritis'] },
  { code: 'K29.01', description: 'Acute gastritis with bleeding', aliases: ['التهاب معدة حاد'] },
  { code: 'K25.9', description: 'Peptic ulcer, site unspecified, unspecified as acute or chronic, without hemorrhage or perforation', aliases: ['قرحة هضمية', 'peptic ulcer'] },
  { code: 'K58.0', description: 'Irritable bowel syndrome with diarrhea', aliases: ['القولون العصبي', 'IBS', 'متلازمة الأمعاء الحساسة'] },
  { code: 'K58.9', description: 'Irritable bowel syndrome without diarrhea', aliases: ['IBS constipation'] },
  { code: 'K59.1', description: 'Diarrhea', aliases: ['إسهال', 'diarrhea'] },
  { code: 'K59.0', description: 'Constipation', aliases: ['إمساك', 'constipation'] },
  { code: 'A09', description: 'Infectious gastroenteritis and colitis, unspecified', aliases: ['التهاب معدة وأمعاء معدي', 'gastroenteritis', 'food poisoning'] },
  { code: 'K52.9', description: 'Noninfective colitis, unspecified', aliases: ['التهاب القولون'] },
  { code: 'K51.90', description: 'Ulcerative colitis, unspecified, without complications', aliases: ['التهاب القولون التقرحي', 'ulcerative colitis'] },
  { code: 'K50.90', description: "Crohn's disease, unspecified, without complications", aliases: ['داء كرون', "Crohn's disease"] },
  { code: 'K64.0', description: 'First degree hemorrhoids', aliases: ['البواسير', 'hemorrhoids', 'piles'] },
  { code: 'K64.1', description: 'Second degree hemorrhoids', aliases: ['بواسير'] },
  { code: 'K64.2', description: 'Third degree hemorrhoids', aliases: ['بواسير درجة ثالثة'] },
  { code: 'K80.90', description: 'Cholelithiasis without cholecystitis without obstruction', aliases: ['حصوات المرارة', 'gallstones'] },
  { code: 'K81.90', description: 'Cholecystitis, unspecified', aliases: ['التهاب المرارة', 'cholecystitis'] },
  { code: 'K70.9', description: 'Unspecified cirrhosis of liver', aliases: ['تليف الكبد', 'cirrhosis'] },
  { code: 'K73.9', description: 'Chronic hepatitis, unspecified', aliases: ['التهاب كبدي مزمن', 'chronic hepatitis'] },
  { code: 'K75.4', description: 'Autoimmune hepatitis', aliases: ['التهاب كبدي مناعي ذاتي'] },
  { code: 'K76.0', description: 'Fatty (change of) liver, not elsewhere classified', aliases: ['الكبد الدهني', 'fatty liver', 'NAFLD'] },
  { code: 'B15.9', description: 'Hepatitis A without complications', aliases: ['التهاب الكبد الفيروسي أ', 'hepatitis A'] },
  { code: 'B16.9', description: 'Hepatitis B without complications', aliases: ['التهاب الكبد الفيروسي ب', 'hepatitis B'] },
  { code: 'B18.2', description: 'Chronic hepatitis C', aliases: ['التهاب الكبد الفيروسي ج المزمن', 'hepatitis C'] },

  // CARDIOVASCULAR (I00-I99)
  { code: 'I10', description: 'Essential (primary) hypertension', aliases: ['ارتفاع ضغط الدم', 'hypertension', 'ضغط دم'] },
  { code: 'I11.9', description: 'Hypertensive chronic kidney disease with stage 1 through stage 4 chronic kidney disease, or unspecified chronic kidney disease', aliases: ['ارتفاع ضغط مع قصور كلوي'] },
  { code: 'I20.0', description: 'Unstable angina', aliases: ['ذبحة صدرية غير مستقرة', 'unstable angina'] },
  { code: 'I20.1', description: 'Angina with documented spasm', aliases: ['ذبحة صدرية مع تشنج'] },
  { code: 'I21.9', description: 'ST elevation (STEMI) and non-ST elevation (NSTEMI) myocardial infarction of unspecified site', aliases: ['احتشاء عضلة القلب', 'heart attack', 'MI'] },
  { code: 'I50.9', description: 'Heart failure, unspecified', aliases: ['قصور القلب', 'heart failure', 'فشل القلب'] },
  { code: 'I48.91', description: 'Unspecified atrial fibrillation', aliases: ['الرجفان الأذيني', 'atrial fibrillation', 'AFib'] },
  { code: 'I49.40', description: 'Unspecified premature atrial contraction', aliases: ['انقباضات سابقة لأوانها'] },
  { code: 'I36.90', description: 'Acute myocarditis, unspecified', aliases: ['التهاب عضلة القلب', 'myocarditis'] },
  { code: 'I38', description: 'Acute rheumatic fever', aliases: ['الحمى الروماتيزمية الحادة', 'acute rheumatic fever'] },
  { code: 'I80.9', description: 'Phlebitis and thrombophlebitis of unspecified site', aliases: ['التهاب الوريد', 'phlebitis'] },
  { code: 'I82.90', description: 'Unspecified embolism and thrombosis of unspecified deep veins of unspecified lower extremity', aliases: ['جلطة الأوردة العميقة', 'DVT', 'thrombosis'] },
  { code: 'I83.9', description: 'Varicose veins of unspecified lower extremity without complications', aliases: ['دوالي الأوردة', 'varicose veins'] },
  { code: 'I95.1', description: 'Orthostatic hypotension', aliases: ['انخفاض ضغط الدم', 'hypotension', 'low blood pressure'] },
  { code: 'I95.9', description: 'Hypotension, unspecified', aliases: ['ضغط دم منخفض'] },

  // ENDOCRINE (E00-E99)
  { code: 'E10.9', description: 'Type 1 diabetes mellitus without complications', aliases: ['السكري من النوع الأول', 'type 1 diabetes', 'السكر'] },
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', aliases: ['السكري من النوع الثاني', 'type 2 diabetes'] },
  { code: 'E11.22', description: 'Type 2 diabetes mellitus with diabetic chronic kidney disease', aliases: ['السكري مع مضاعفات كلوية'] },
  { code: 'E11.65', description: 'Type 2 diabetes mellitus with hyperglycemia', aliases: ['السكري مع ارتفاع السكر'] },
  { code: 'E03.9', description: 'Hypothyroidism, unspecified', aliases: ['قصور الغدة الدرقية', 'hypothyroidism'] },
  { code: 'E05.90', description: 'Thyrotoxicosis, unspecified without thyroid storm', aliases: ['فرط نشاط الغدة الدرقية', 'hyperthyroidism'] },
  { code: 'E06.9', description: 'Thyroiditis, unspecified', aliases: ['التهاب الغدة الدرقية', 'thyroiditis'] },
  { code: 'E66.9', description: 'Obesity, unspecified', aliases: ['السمنة', 'obesity'] },
  { code: 'E78.5', description: 'Lipemia, unspecified', aliases: ['ارتفاع الدهون', 'hyperlipidemia'] },
  { code: 'E78.0', description: 'Pure hypercholesterolemia', aliases: ['ارتفاع الكوليسترول', 'high cholesterol'] },
  { code: 'E78.2', description: 'Mixed hyperlipidemia', aliases: ['ارتفاع الدهون المختلطة'] },
  { code: 'E83.30', description: 'Disorder of phosphate metabolism and phosphatase deficiency, unspecified', aliases: ['نقص فيتامين د', 'vitamin D deficiency'] },
  { code: 'E61.1', description: 'Iron deficiency', aliases: ['نقص الحديد', 'iron deficiency anemia'] },
  { code: 'D50.9', description: 'Iron deficiency anemia, unspecified', aliases: ['فقر دم نقص الحديد', 'anemia'] },
  { code: 'M10.9', description: 'Gout, unspecified', aliases: ['النقرس', 'gout'] },
  { code: 'E79.0', description: 'Hyperuricemia without signs of inflammatory arthritis and tophaceous disease', aliases: ['ارتفاع حمض اليوريك'] },

  // MUSCULOSKELETAL (M00-M99)
  { code: 'M15.0', description: 'Primary polyosteoarthritis', aliases: ['هشاشة العظام', 'osteoarthritis'] },
  { code: 'M17.0', description: 'Primary osteoarthritis of knee', aliases: ['خشونة الركبة', 'knee osteoarthritis'] },
  { code: 'M19.90', description: 'Unspecified osteoarthritis of unspecified site', aliases: ['خشونة المفاصل'] },
  { code: 'M05.90', description: 'Unspecified rheumatoid arthritis of unspecified site', aliases: ['التهاب المفاصل الروماتويدي', 'rheumatoid arthritis'] },
  { code: 'M54.5', description: 'Low back pain', aliases: ['آلام أسفل الظهر', 'back pain', 'ألم الظهر'] },
  { code: 'M54.6', description: 'Pain in thoracic spine', aliases: ['آلام الظهر العلوي'] },
  { code: 'M51.26', description: 'Specified lumbar region with radiculopathy', aliases: ['فتق القرص الفقري', 'disc herniation', 'herniated disc'] },
  { code: 'M80.90', description: 'Unspecified osteoporosis with current pathological fracture', aliases: ['هشاشة العظام', 'osteoporosis'] },
  { code: 'M79.7', description: 'Fibromyalgia', aliases: ['الألياف العضلية', 'fibromyalgia'] },
  { code: 'M65.9', description: 'Synovitis and tenosynovitis, unspecified', aliases: ['التهاب الأوتار', 'tendinitis', 'التهاب الأنسجة'] },
  { code: 'M75.4', description: 'Impingement syndrome of shoulder', aliases: ['متلازمة الضغط على الكتف'] },
  { code: 'M75.0', description: 'Adhesive capsulitis of shoulder', aliases: ['تجمد الكتف', 'frozen shoulder'] },
  { code: 'M47.812', description: 'Spondylosis of cervical region with myelopathy', aliases: ['فقرات عنقية', 'cervical spondylosis'] },
  { code: 'M47.891', description: 'Other spondylosis of lumbar region', aliases: ['فقرات قطنية'] },
  { code: 'M76.6', description: 'Achilles tendinitis', aliases: ['التهاب وتر أخيل', 'Achilles tendinitis'] },
  { code: 'M25.5', description: 'Pain in joint', aliases: ['آلام المفاصل', 'joint pain'] },

  // NEUROLOGICAL (G00-G99)
  { code: 'G43.909', description: 'Unspecified migraine without aura', aliases: ['الصداع النصفي', 'migraine', 'شقيقة'] },
  { code: 'G43.001', description: 'Migraine with aura with intractable migraine', aliases: ['صداع نصفي مع أورة'] },
  { code: 'G44.1', description: 'Tension-type headache', aliases: ['صداع التوتر', 'tension headache'] },
  { code: 'R51.9', description: 'Headache, unspecified', aliases: ['صداع', 'headache'] },
  { code: 'G40.90', description: 'Unspecified epilepsy', aliases: ['الصرع', 'epilepsy'] },
  { code: 'G40.A09', description: 'Absence seizures, not intractable', aliases: ['نوبات صرعية غيابية'] },
  { code: 'G51.0', description: "Bell's palsy", aliases: ['شلل بيل', "Bell's palsy", 'شلل الوجه'] },
  { code: 'G56.0', description: 'Carpal tunnel syndrome', aliases: ['متلازمة النفق الرسغي', 'carpal tunnel'] },
  { code: 'G64', description: 'Other disorders of peripheral nervous system', aliases: ['اعتلال الأعصاب الطرفية', 'peripheral neuropathy'] },
  { code: 'H81.10', description: 'Benign paroxysmal positional vertigo of unspecified ear', aliases: ['الدوار', 'vertigo', 'دوار الرأس'] },
  { code: 'R42', description: 'Dizziness and giddiness', aliases: ['الدوخة', 'dizziness'] },
  { code: 'G20', description: "Parkinson's disease", aliases: ['الشلل الرعاش', "Parkinson's disease"] },
  { code: 'G30.9', description: "Alzheimer's disease, unspecified", aliases: ['الزهايمر', "Alzheimer's disease"] },
  { code: 'G35', description: 'Multiple sclerosis', aliases: ['التصلب المتعدد', 'MS'] },

  // PSYCHIATRIC (F00-F99)
  { code: 'F32.9', description: 'Major depressive disorder, single episode, unspecified', aliases: ['الاكتئاب', 'depression', 'الاكتئاب الشديد'] },
  { code: 'F33.9', description: 'Major depressive disorder, recurrent, unspecified', aliases: ['اكتئاب متكرر'] },
  { code: 'F41.1', description: 'Generalized anxiety disorder', aliases: ['القلق', 'anxiety', 'اضطراب القلق العام'] },
  { code: 'F41.0', description: 'Panic disorder [episodic paroxysmal anxiety]', aliases: ['اضطراب الهلع', 'panic disorder'] },
  { code: 'G47.00', description: 'Insomnia, unspecified', aliases: ['الأرق', 'insomnia', 'عدم القدرة على النوم'] },
  { code: 'G47.10', description: 'Hypersomnia, unspecified', aliases: ['فرط النوم'] },
  { code: 'F42.9', description: 'Obsessive-compulsive disorder, unspecified', aliases: ['الوسواس القهري', 'OCD'] },
  { code: 'F43.10', description: 'Post-traumatic stress disorder, unspecified', aliases: ['اضطراب ما بعد الصدمة', 'PTSD'] },

  // DERMATOLOGICAL (L00-L99)
  { code: 'L20.9', description: 'Atopic dermatitis, unspecified', aliases: ['الإكزيما', 'eczema', 'التهاب جلدي تحسسي'] },
  { code: 'L40.9', description: 'Psoriasis, unspecified', aliases: ['الصدفية', 'psoriasis'] },
  { code: 'L70.9', description: 'Acne, unspecified', aliases: ['حب الشباب', 'acne'] },
  { code: 'L50.9', description: 'Urticaria, unspecified', aliases: ['الشرى', 'urticaria', 'حساسية جلدية'] },
  { code: 'B35.9', description: 'Dermatophytosis, unspecified', aliases: ['عدوى فطرية', 'fungal infection'] },
  { code: 'B36.9', description: 'Unspecified tinea', aliases: ['السعفة', 'tinea', 'تينيا'] },
  { code: 'L25.9', description: 'Unspecified contact dermatitis', aliases: ['التهاب جلدي تماسي', 'contact dermatitis'] },
  { code: 'L64.9', description: 'Androgenetic alopecia, unspecified', aliases: ['الصلع', 'hair loss', 'alopecia'] },
  { code: 'L63.9', description: 'Alopecia areata, unspecified', aliases: ['ثعلبة', 'alopecia areata'] },
  { code: 'L81.4', description: 'Leukoderma, not elsewhere classified', aliases: ['البهاق', 'vitiligo'] },

  // UROLOGICAL (N00-N99)
  { code: 'N39.0', description: 'Urinary tract infection, site not specified', aliases: ['عدوى المسالك البولية', 'UTI', 'التهاب مسالك بولية'] },
  { code: 'N39.41', description: 'Urge incontinence', aliases: ['سلس البول'] },
  { code: 'N20.9', description: 'Calculus of urinary system, unspecified', aliases: ['حصوات الكلى', 'kidney stones'] },
  { code: 'N21.9', description: 'Calculus of lower urinary tract, unspecified', aliases: ['حصوات المثانة'] },
  { code: 'N40.1', description: 'Benign prostatic hyperplasia with lower urinary tract symptoms', aliases: ['تضخم البروستاتا', 'BPH'] },
  { code: 'N18.3', description: 'Chronic kidney disease, stage 3b', aliases: ['قصور كلوي مزمن', 'chronic kidney disease'] },
  { code: 'N30.9', description: 'Cystitis, unspecified', aliases: ['التهاب المثانة', 'cystitis'] },
  { code: 'N13.6', description: 'Pyonephrosis', aliases: ['التهاب الكلية', 'pyelonephritis'] },
  { code: 'N10', description: 'Acute pyelonephritis', aliases: ['التهاب حاد في الكلية'] },

  // GYNECOLOGICAL (N80-N99, O00-O99)
  { code: 'E28.2', description: 'Polycystic ovarian syndrome', aliases: ['تكيس المبايض', 'PCOS', 'متلازمة تكيس المبايض'] },
  { code: 'N80.9', description: 'Endometriosis, unspecified', aliases: ['بطانة الرحم الهاجرة', 'endometriosis'] },
  { code: 'N92.0', description: 'Excessive, frequent and irregular menstruation with short intervals', aliases: ['نزيف حيضي غزير', 'menorrhagia'] },
  { code: 'N91.2', description: 'Amenorrhea, unspecified', aliases: ['انقطاع الطمث', 'amenorrhea'] },
  { code: 'N92.5', description: 'Unspecified irregular menstruation', aliases: ['عدم انتظام الدورة الشهرية', 'irregular periods'] },
  { code: 'N95.1', description: 'Menopausal and female climacteric states', aliases: ['سن اليأس', 'menopause'] },

  // OPHTHALMOLOGICAL (H00-H59)
  { code: 'H10.9', description: 'Unspecified conjunctivitis', aliases: ['التهاب الملتحمة', 'conjunctivitis', 'احمرار العين'] },
  { code: 'H40.9', description: 'Unspecified glaucoma', aliases: ['الجلوكوما', 'glaucoma', 'ارتفاع ضغط العين'] },
  { code: 'H26.9', description: 'Unspecified cataract', aliases: ['الكتاراكتا', 'cataract', 'المياه البيضاء'] },
  { code: 'H04.12', description: 'Dry eye syndrome', aliases: ['جفاف العين', 'dry eye'] },
  { code: 'H52.20', description: 'Hyperopia, unspecified eye', aliases: ['طول النظر', 'hyperopia'] },
  { code: 'H52.10', description: 'Myopia, unspecified eye', aliases: ['قصر النظر', 'myopia'] },
  { code: 'H52.40', description: 'Presbyopia', aliases: ['قصر النظر الشيخوخي', 'presbyopia'] },
  { code: 'H53.0', description: 'Amblyopia ex anopsia', aliases: ['العين الكسولة', 'lazy eye'] },

  // OTOLOGIC (H60-H95)
  { code: 'H66.90', description: 'Otitis media, unspecified', aliases: ['التهاب الأذن الوسطى', 'otitis media', 'التهاب الأذن'] },
  { code: 'H60.90', description: 'Unspecified otitis externa', aliases: ['التهاب الأذن الخارجية', 'otitis externa'] },
  { code: 'H90.5', description: 'Unspecified sensorineural hearing loss', aliases: ['ضعف السمع', 'hearing loss'] },
  { code: 'H91.90', description: 'Unspecified hearing loss, unspecified ear', aliases: ['فقدان السمع'] },
  { code: 'H93.10', description: 'Tinnitus, unspecified ear', aliases: ['طنين الأذن', 'tinnitus', 'صوت في الأذن'] },

  // INFECTIOUS DISEASES (A00-B99)
  { code: 'A01.00', description: 'Typhoid fever with heart involvement', aliases: ['حمى التيفويد', 'typhoid'] },
  { code: 'A02.9', description: 'Salmonella infection, unspecified', aliases: ['عدوى السلمونيلا'] },
  { code: 'B01.9', description: 'Varicella without complication', aliases: ['الجدري المائي', 'chickenpox'] },
  { code: 'B06.9', description: 'Rubella without complication', aliases: ['الحصبة الألمانية', 'rubella'] },
  { code: 'B05.9', description: 'Measles without complication', aliases: ['الحصبة', 'measles'] },
  { code: 'A15.0', description: 'Tuberculosis of lung', aliases: ['السل', 'tuberculosis', 'TB'] },
  { code: 'B20.9', description: 'Unspecified HIV disease', aliases: ['فيروس نقص المناعة', 'HIV'] },
  { code: 'U07.1', description: 'COVID-19, virus identified', aliases: ['كوفيد 19', 'COVID-19', 'فيروس كورونا'] },

  // SYMPTOMS & SIGNS (R00-R99)
  { code: 'R01.0', description: 'Abnormal heart sounds', aliases: ['أصوات قلب غير طبيعية'] },
  { code: 'R00.0', description: 'Tachycardia, unspecified', aliases: ['تسارع ضربات القلب', 'tachycardia'] },
  { code: 'R00.1', description: 'Bradycardia, unspecified', aliases: ['بطء ضربات القلب', 'bradycardia'] },
  { code: 'R06.3', description: 'Periodic breathing', aliases: ['تنفس دوري'] },
  { code: 'R07.9', description: 'Chest pain, unspecified', aliases: ['ألم صدري', 'chest pain', 'ألم الصدر'] },
  { code: 'R10.9', description: 'Unspecified abdominal pain', aliases: ['ألم البطن', 'abdominal pain', 'ألم المعدة'] },
  { code: 'R10.1', description: 'Pain localized to upper abdomen', aliases: ['ألم أعلى البطن'] },
  { code: 'R10.3', description: 'Pain localized to other parts of lower abdomen', aliases: ['ألم أسفل البطن'] },
  { code: 'R13.10', description: 'Dysphagia, oral phase', aliases: ['صعوبة البلع', 'dysphagia'] },
  { code: 'R14.0', description: 'Abdominal distension (gaseous)', aliases: ['انتفاخ البطن', 'bloating'] },
  { code: 'R16.0', description: 'Hepatomegaly, not elsewhere classified', aliases: ['تضخم الكبد'] },
  { code: 'R17', description: 'Unspecified jaundice', aliases: ['اليرقان', 'jaundice'] },
  { code: 'R19.7', description: 'Diarrhea', aliases: ['إسهال'] },
  { code: 'R23.1', description: 'Pallor', aliases: ['شحوب'] },
  { code: 'R23.3', description: 'Spontaneous ecchymosis', aliases: ['كدمات'] },
  { code: 'R25.0', description: 'Abnormal head movements', aliases: ['حركات رأس غير طبيعية'] },
  { code: 'R26.0', description: 'Ataxia, unspecified', aliases: ['عدم التوازن'] },
  { code: 'R29.6', description: 'Tendency to fall, not elsewhere classified', aliases: ['ميل للسقوط'] },
  { code: 'R31.9', description: 'Hematuria, unspecified', aliases: ['دم في البول'] },
  { code: 'R32', description: 'Unspecified urinary incontinence', aliases: ['سلس البول'] },
  { code: 'R35.0', description: 'Frequency of micturition', aliases: ['كثرة التبول'] },
  { code: 'R39.15', description: 'Urgency of micturition', aliases: ['ملحة للتبول'] },
  { code: 'R40.1', description: 'Stupor', aliases: ['غياب عن الوعي'] },
  { code: 'R41.1', description: 'Anterograde amnesia', aliases: ['فقدان الذاكرة'] },
  { code: 'R44.0', description: 'Bizarreness and oddness of presentation', aliases: ['سلوك غريب'] },
  { code: 'R45.1', description: 'Restlessness and agitation', aliases: ['قلق وأرق'] },
  { code: 'R45.2', description: 'Unhappiness', aliases: ['حزن'] },
  { code: 'R45.7', description: 'State of emotional shock and stress, unspecified', aliases: ['صدمة عاطفية'] },
  { code: 'R50.9', description: 'Fever, unspecified', aliases: ['حمى', 'fever', 'ارتفاع حرارة'] },
  { code: 'R51', description: 'Headache', aliases: ['صداع'] },
  { code: 'R53.83', description: 'Other fatigue', aliases: ['إرهاق', 'fatigue', 'تعب'] },
  { code: 'R56.9', description: 'Unspecified convulsions', aliases: ['تشنجات', 'seizures'] },
  { code: 'R60.0', description: 'Localized edema', aliases: ['تورم موضعي', 'swelling'] },
  { code: 'R60.1', description: 'Generalized edema', aliases: ['انتفاخ عام'] },
  { code: 'R61', description: 'Hyperhidrosis', aliases: ['إفراط التعرق', 'excessive sweating'] },
  { code: 'R63.0', description: 'Anorexia', aliases: ['فقدان الشهية', 'anorexia'] },
  { code: 'R63.1', description: 'Polydipsia', aliases: ['العطش الزائد'] },
  { code: 'R63.2', description: 'Excessive thirst', aliases: ['عطش شديد'] },
  { code: 'R63.4', description: 'Abnormal weight loss', aliases: ['خسارة وزن غير طبيعية'] },
  { code: 'R63.5', description: 'Abnormal weight gain', aliases: ['اكتساب وزن غير طبيعي'] },
  { code: 'R64', description: 'Cachexia', aliases: ['هزال', 'wasting'] },
  { code: 'R69', description: 'Illness, unspecified', aliases: ['مرض غير محدد'] },
  { code: 'R74.0', description: 'Elevation of levels of transaminase and lactic acid dehydrogenase [LDH]', aliases: ['ارتفاع إنزيمات الكبد'] },
  { code: 'R76.8', description: 'Other specified abnormal immunological findings in serum', aliases: ['اختبارات دم غير طبيعية'] },
  { code: 'R82.99', description: 'Unspecified abnormal findings in urine', aliases: ['تحليل بول غير طبيعي'] },
]

/**
 * Search for ICD-10 diagnosis codes
 * Uses fuzzy matching on code, description, and aliases
 */
export function searchICD10(query: string, limit: number = 10) {
  if (!query || query.trim().length === 0) {
    return []
  }

  const lowerQuery = query.toLowerCase()

  const results = ICD10_DATABASE.filter(item => {
    const codeMatch = item.code.toLowerCase().includes(lowerQuery)
    const descMatch = item.description.toLowerCase().includes(lowerQuery)
    const aliasMatch = item.aliases.some(alias => alias.toLowerCase().includes(lowerQuery))

    return codeMatch || descMatch || aliasMatch
  })

  return results.slice(0, limit)
}

/**
 * Common medication frequencies
 */
export const MEDICATION_FREQUENCIES = [
  { value: 'once-daily', label: 'Once daily', shorthand: 'OD' },
  { value: 'twice-daily', label: 'Twice daily', shorthand: 'BD' },
  { value: 'three-times-daily', label: 'Three times daily', shorthand: 'TDS' },
  { value: 'four-times-daily', label: 'Four times daily', shorthand: 'QDS' },
  { value: 'every-6-hours', label: 'Every 6 hours', shorthand: 'Q6H' },
  { value: 'every-8-hours', label: 'Every 8 hours', shorthand: 'Q8H' },
  { value: 'before-meals', label: 'Before meals', shorthand: 'AC' },
  { value: 'after-meals', label: 'After meals', shorthand: 'PC' },
  { value: 'at-bedtime', label: 'At bedtime', shorthand: 'HS' },
  { value: 'as-needed', label: 'As needed', shorthand: 'PRN' },
]

/**
 * Common medication durations
 */
export const MEDICATION_DURATIONS = [
  { value: '3-days', label: '3 days' },
  { value: '5-days', label: '5 days' },
  { value: '7-days', label: '7 days' },
  { value: '10-days', label: '10 days' },
  { value: '14-days', label: '14 days' },
  { value: '1-month', label: '1 month' },
  { value: '3-months', label: '3 months' },
  { value: 'ongoing', label: 'Ongoing' },
]

/**
 * Mapping of chief complaints to suggested diagnoses
 * Used to provide contextual diagnosis suggestions based on patient's complaints
 */
export const COMPLAINT_TO_DIAGNOSIS: Record<string, string[]> = {
  'fever': [
    'R50.9: Fever, unspecified',
    'J00: Acute nasopharyngitis [common cold]',
    'J06.9: Acute upper respiratory infection, unspecified',
    'J02.9: Acute pharyngitis, unspecified',
    'A09: Infectious gastroenteritis and colitis, unspecified',
  ],
  'cough': [
    'J06.9: Acute upper respiratory infection, unspecified',
    'J00: Acute nasopharyngitis [common cold]',
    'J20.9: Acute bronchitis, unspecified',
    'J02.9: Acute pharyngitis, unspecified',
  ],
  'sore throat': [
    'J02.9: Acute pharyngitis, unspecified',
    'J06.9: Acute upper respiratory infection, unspecified',
    'J00: Acute nasopharyngitis [common cold]',
  ],
  'headache': [
    'R51.9: Headache, unspecified',
    'J06.9: Acute upper respiratory infection, unspecified',
    'R50.9: Fever, unspecified',
  ],
  'abdominal pain': [
    'K29.70: Gastritis, unspecified',
    'A09: Infectious gastroenteritis and colitis, unspecified',
    'K59.1: Diarrhea',
  ],
  'nausea': [
    'K29.70: Gastritis, unspecified',
    'A09: Infectious gastroenteritis and colitis, unspecified',
    'R11: Nausea and vomiting',
  ],
  'back pain': [
    'M54.5: Low back pain',
    'M54.6: Pain in thoracic spine',
    'M54.9: Dorsalgia, unspecified',
  ],
  'urinary': [
    'N39.0: Urinary tract infection, site not specified',
    'N39.9: Disorder of urinary system, unspecified',
  ],
  'runny nose': [
    'J00: Acute nasopharyngitis [common cold]',
    'J30.9: Allergic rhinitis, unspecified',
    'J06.9: Acute upper respiratory infection, unspecified',
  ],
  'allergy': [
    'J30.9: Allergic rhinitis, unspecified',
    'L50.9: Urticaria, unspecified',
  ],
  'high blood pressure': [
    'I10: Essential (primary) hypertension',
  ],
  'diabetes': [
    'E11.9: Type 2 diabetes mellitus without complications',
    'E10.9: Type 1 diabetes mellitus without complications',
  ],
}
