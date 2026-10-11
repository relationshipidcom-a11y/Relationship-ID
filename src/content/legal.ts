export const LEGAL_VERSION = '2026-10-10';

export interface LegalSection {
  heading: string;
  body: string;
}

export interface LegalDocument {
  privacyTitle: string;
  privacySections: LegalSection[];
  termsTitle: string;
  termsSections: LegalSection[];
}

export const legalContent: { en: LegalDocument; ar: LegalDocument } = {
  en: {
    privacyTitle: 'Privacy Policy',
    privacySections: [
      {
        heading: '1. Who We Are',
        body: 'The data controller responsible for personal data processed through Relationship ID is Ramy Gabriel, located in Al Fayha District, Riyadh 14253, Saudi Arabia. For any questions, data subject requests, or privacy inquiries, contact customerservices@relationshipid.org. Data subjects may use this email address to exercise their legal rights under applicable law.'
      },
      {
        heading: '2. What We Collect',
        body: 'We collect account and authentication data (email address and phone number), profile information (full legal names in Arabic and English, and up to six optional social media accounts), verification status, partner invitations, mutual relationship records, certificate identifiers, notifications, technical server logs (such as request and error logs kept by our hosting provider), and anonymous client-side error event reports. Date of birth is self-declared by users solely to verify that both participants are consenting adults aged 18 or older; date of birth is strictly confidential and is never shown on public certificates or shared with third parties.'
      },
      {
        heading: '3. How Long We Keep Data',
        body: 'Account and profile data is kept for as long as the account exists. A pending partner invitation expires 72 hours (3 days) after it is created and can no longer be accepted after that point. If invitations from the same sender are declined three times, a permanent block is recorded; only the recipient can remove that block, from within the app. When either partner ends a relationship record, or when a user deletes their account, the relationship record, the issued certificate, the public verification entry, the related invitations, change requests and notifications, and the contact reservations held for that record are all deleted, and public verification stops working immediately. Deleting an account additionally removes the account from Firebase Authentication together with the user profile document and that user\'s block list. Short-lived internal progress markers created during deletion are removed once deletion completes. Rate-limiting counters are held in server memory only and are never written to the database. We do not operate support-ticket, abuse-report or user activity log collections.'
      },
      {
        heading: '4. What Is Public',
        body: 'When a relationship certificate is issued upon mutual confirmation, the public verification page and QR code display only the following information to anyone possessing the certificate link or verification reference: the verified legal names of both partners, the relationship stage (Dating, Engaged, or Married), and the relationship start date. Additionally, an optional public contact search feature (disabled by default and requiring explicit consent from both partners) allows third parties who already know an exact verified phone number or email address to verify only the existence and stage of an active relationship, without revealing names, dates, or other private data. Contact details (email and phone number), date of birth, user identifiers, invitation records, and private security logs are otherwise never made public.'
      },
      {
        heading: '5. Lawful Basis for Processing',
        body: 'We process personal data on the following legal bases under the Saudi Personal Data Protection Law (PDPL): (a) Performance of a contract and service delivery requested by the user, including account registration, profile management, invitation dispatch, mutual record creation, and certificate issuance; (b) Explicit consent provided by both partners for creating the mutual relationship record and publicly displaying the verified certificate details; and (c) Legitimate interests in platform security, abuse prevention, rate limiting, and fraud prevention through App Check and server-side request validation.'
      },
      {
        heading: '6. Where Data Is Processed',
        body: 'Application data stored in Cloud Firestore is hosted in europe-west2 (London). Application server operations in server.ts are hosted in europe-west1 (Belgium).\n\nFirebase Authentication is a global Google service holding account email addresses and phone numbers, and cannot be restricted to a single region, so those authentication identifiers may be processed outside Saudi Arabia and outside the regions listed above across Google infrastructure.'
      },
      {
        heading: '7. Processors and Third Parties',
        body: 'We engage trusted processors to support our service: (a) Google LLC provides Firebase Authentication, Cloud Firestore, and Firebase App Check infrastructure; (b) Google reCAPTCHA Enterprise is utilized for App Check token verification to safeguard API endpoints against automated abuse and bots, which sets Google cookies strictly for abuse prevention; and (c) Twilio Inc. processes user mobile numbers solely to deliver one-time verification passcodes through WhatsApp to verify the user\'s mobile number.'
      },
      {
        heading: '8. Cookies and Device Storage',
        body: 'Relationship ID sets no cookies of its own. To maintain user login sessions, Firebase Authentication utilizes browser local storage when "Keep me signed in" is selected, or session storage when unselected (falling back to temporary in-memory session if browser storage is unavailable). We run no third-party analytics, behavioral tracking, or advertising networks. The only cookies utilized are those set directly by Google reCAPTCHA Enterprise for security and automated abuse detection, which are strictly necessary for service operation.'
      },
      {
        heading: '9. Your Rights as a Data Subject',
        body: 'Under the Saudi Personal Data Protection Law (PDPL), you have rights regarding your personal data: (a) Right to be informed about how your personal data is collected and processed; (b) Right of access and data portability — you can download a machine-readable JSON copy of your own data at any time from the account menu in the app, using "Download My Data (JSON)", and you may also request a copy by emailing customerservices@relationshipid.org; (c) Right to correction of protected profile fields, available directly in the application through mutual partner change requests; (d) Right to erasure (destruction of personal data), available directly in the application through the Delete Account feature; and (e) Right to withdraw consent at any time, including ending the relationship record through the application, which immediately revokes and removes public verification. For any requests not directly automated in the interface, contact customerservices@relationshipid.org. You also have the right to lodge a complaint with the Saudi Data & AI Authority (SDAIA) if you believe your personal data is being processed in violation of applicable laws.'
      },
      {
        heading: '10. Security and Breach Notification',
        body: 'We implement verified security measures including mandatory Firebase App Check enforcement on all sensitive API routes, token-based authentication verification, server-side authorization checks, and strict access controls. In the event of a personal data breach that compromises personal data security or user privacy, we commit to notifying the Saudi Data & AI Authority (SDAIA) and affected individuals within the timeframes and manners prescribed by the PDPL.'
      },
      {
        heading: '11. Children\'s Privacy',
        body: 'Relationship ID is strictly restricted to adults aged 18 or older. We do not knowingly collect, maintain, or process personal data from anyone under the age of 18. Any account found to belong to a minor will be terminated immediately and associated data deleted.'
      },
      {
        heading: '12. Changes to This Policy',
        body: 'This Privacy Policy is versioned (current version: 2026-10-01). We may update this policy periodically to reflect operational, legal, or regulatory requirements. Users will be asked to review and accept materially updated terms before continuing to use the service.'
      }
    ],
    termsTitle: 'Terms of Use',
    termsSections: [
      {
        heading: '1. About the platform',
        body: 'Relationship ID records a relationship with the consent of two adults. The relationship is digitally documented with a reference number and barcode.'
      },
      {
        heading: '2. Using the platform',
        body: 'You must be at least 18 years old. Provide accurate information, protect your account, and send invitations only with your partner’s knowledge and consent. Fraud, abuse, impersonation, and bypassing security are prohibited.'
      },
      {
        heading: '3. Sharing the certificate',
        body: 'With both partners’ consent, their names, relationship stage, and start date are visible to anyone with the certificate link or QR code. Either partner can end the relationship. The certificate’s public display and verification will then stop immediately.'
      },
      {
        heading: '4. Invitations',
        body: 'The relationship is not recorded until the second partner accepts. They can reject the invitation or block the sender.'
      },
      {
        heading: '5. Account suspension',
        body: 'We may suspend or delete an account or relationship record without notice for violating these Terms or misusing the service.'
      },
      {
        heading: '6. Ownership and your data',
        body: 'The platform, its design, and its logo belong to Relationship ID . Org. Your data remains yours. You allow us to use it to operate the service and display the certificate with your consent.'
      },
      {
        heading: '7. Service availability',
        body: 'Errors or interruptions may occur. We do not guarantee continuous operation and are not liable for indirect damages to the extent permitted by law.'
      },
      {
        heading: '8. Certificate limits',
        body: 'The certificate does not grant marriage, alimony, inheritance, immigration, or residency rights, and creates no financial obligations or government registration.'
      },
      {
        heading: '9. Disputes',
        body: 'Applicable laws apply, and competent courts will hear any dispute.'
      },
      {
        heading: '10. Updates to terms',
        body: 'Current version: 2026-10-10.\nContinued use means acceptance of updates, and we will ask for renewed consent for significant changes.'
      },
      {
        heading: '11. Contact',
        body: 'customerservices@relationshipid.org'
      }
    ]
  },
  ar: {
    privacyTitle: 'سياسة الخصوصية',
    privacySections: [
      {
        heading: '1. من نحن',
        body: 'الجهة المسؤولة والمتحكمة في معالجة البيانات الشخصية عبر منصة "Relationship ID" هو رامي جبرائيل (Ramy Gabriel)، المقيم في حي الفيحاء، الرياض 14253، المملكة العربية السعودية. لأي استفسارات أو ممارسة حقوق أصحاب البيانات الشخصية أو المسائل المتعلقة بالخصوصية، يمكنكم التواصل عبر البريد الإلكتروني: customerservices@relationshipid.org. يحق لأصحاب البيانات استخدام هذا العنوان لممارسة حقوقهم النظامية وفقاً للأنظمة المعمول بها.'
      },
      {
        heading: '2. ما نجمعه من بيانات',
        body: 'نقوم بجمع بيانات الحساب والمصادقة (عنوان البريد الإلكتروني ورقم الهاتف)، وبيانات الملف التعريفي (الأسماء القانونية الكاملة باللغتين العربية والإنجليزية، وما يصل إلى ستة حسابات اختيارية على شبكات التواصل الاجتماعي)، وحالة التحقق، والدعوات، وسجلات العلاقات المشتركة، ومعرفات الشهادات، والإشعارات، والسجلات التقنية للخادم (مثل سجلات الطلبات والأخطاء التي يحتفظ بها مزود الاستضافة)، وتقارير أخطاء واجهة المستخدم المجهولة. يُصرّح المستخدمون بتاريخ الميلاد ذاتياً فقط للتحقق من الأهلية النظامية بأن كِلا الطرفين بالغين (18 عاماً فأكثر)؛ ويُعد تاريخ الميلاد سرياً تماماً ولا يُعرض على الإطلاق في الشهادات العامة ولا يُشارك مع أي أطراف ثالثة.'
      },
      {
        heading: '3. مدة الاحتفاظ بالبيانات',
        body: 'يُحتفظ ببيانات الحساب والملف التعريفي طوال مدة وجود الحساب. وتنتهي صلاحية دعوة الشريك المعلقة بعد 72 ساعة (ثلاثة أيام) من إنشائها، ولا يمكن قبولها بعد ذلك. وإذا رُفضت دعوات المرسل نفسه ثلاث مرات، يُسجَّل حظر دائم، ولا يمكن إلغاء هذا الحظر إلا من قِبل الطرف المستقبل للدعوة من داخل التطبيق. وعند إنهاء أي من الشريكين لسجل العلاقة، أو عند حذف المستخدم لحسابه، تُحذف نهائياً سجل العلاقة والشهادة الصادرة ومدخل التحقق العام والدعوات وطلبات التعديل والإشعارات المرتبطة بالسجل وحجوزات بيانات الاتصال الخاصة به، ويتوقف التحقق العام عن العمل فوراً. ويؤدي حذف الحساب كذلك إلى إزالة الحساب من خدمة Firebase Authentication مع وثيقة الملف التعريفي وقائمة الحظر الخاصة بذلك المستخدم. وتُحذف المؤشرات الداخلية المؤقتة الخاصة بتتبع عملية الحذف بمجرد اكتمالها. أما عدّادات تحديد معدل الطلبات فتُحفظ في ذاكرة الخادم فقط ولا تُكتب في قاعدة البيانات مطلقاً. ولا نشغّل أي مجموعات لتذاكر الدعم أو بلاغات الإساءة أو سجلات نشاط المستخدمين.'
      },
      {
        heading: '4. ما يُعرض علناً للعموم',
        body: 'عند إصدار شهادة العلاقة بناءً على التأكيد المتبادل بين الطرفين، فإن بوابة التحقق العامة ورمز الاستجابة السريعة (QR) يعرضان فقط البيانات التالية لأي شخص لديه رابط الشهادة أو مرجع التحقق: الاسمان القانونيان المعتمدان لكِلا الشريكين، ومرحلة العلاقة (تعارف، خطوبة، أو زواج)، وتاريخ بدء العلاقة. بالإضافة إلى ذلك، تتيح خاصية البحث عن جهة الاتصال الاختيارية (المعطلة افتراضياً والتي تتطلب موافقة صريحة من كِلا الشريكين) لمن يمتلك بالفعل رقم هاتف أو بريداً إلكترونياً مطابقاً التحقق فقط من وجود علاقة نشطة ومرحلتها الحالية، دون كشف الأسماء أو التواريخ أو أي بيانات شخصية أخرى. ولا يتم إظهار بيانات الاتصال (البريد الإلكتروني ورقم الهاتف)، وتاريخ الميلاد، والمعرفات الداخلية للحسابات، وسجلات الدعوات، وسجلات الأمان الخاصة علناً على الإطلاق.'
      },
      {
        heading: '5. المسوغ النظامي للمعالجة',
        body: 'تتم معالجة البيانات الشخصية استناداً إلى المسوغات النظامية المقررة بموجب نظام حماية البيانات الشخصية في المملكة العربية السعودية: (أ) تنفيذ العقد وتقديم الخدمة التي طلبها المستخدم، بما في ذلك إنشاء الحساب، وإدارة الملف، وإرسال الدعوات، وإنشاء السجل المشترك، وإصدار الشهادة؛ (ب) الموافقة الصريحة الممنوحة من كِلا الشريكين لإنشاء سجل العلاقة المشترك وعرض بيانات الشهادة المعتمدة علناً للتحقق؛ (ج) المصلحة المشروعة في حفظ أمن المنصة، ومنع إساءة الاستخدام، والحد من المعدلات المشبوهة، ومكافحة الاحتيال من خلال خدمة App Check والتحقق البرمجي على الخادم.'
      },
      {
        heading: '6. أين تتم معالجة البيانات',
        body: 'يتم استضافة بيانات التطبيق المخزنة في قاعدة Cloud Firestore في منطقة europe-west2 (لندن). وتتم استضافة عمليات خادم التطبيق (server.ts) في منطقة europe-west1 (بلجيكا).\n\nتُعد خدمة Firebase Authentication خدمة عالمية تابعة لشركة Google وتتولى حفظ عناوين البريد الإلكتروني وأرقام الهواتف الخاصة بالحسابات، ولا يمكن تقييدها بمنطقة جغرافية واحدة، ولذا فقد تتم معالجة تلك المعرفات الخاصة بالمصادقة خارج المملكة العربية السعودية وخارج المناطق المذكورة أعلاه عبر البنية التحتية لشركة Google.'
      },
      {
        heading: '7. معالجو البيانات والأطراف الثالثة',
        body: 'نستعين بجهات معالجة موثوقة لتقديم خدماتنا: (أ) شركة Google LLC التي تقدم البنية التحتية لكل من Firebase Authentication وCloud Firestore وFirebase App Check؛ (ب) خدمة Google reCAPTCHA Enterprise المستخدمة للتحقق من أمان App Check لحماية واجهات البرمجة من البرمجيات الخبيثة والروبوتات، وتقوم بتعيين ملفات تعريف ارتباط (Cookies) خاصة بشركة Google للأغراض الأمنية فقط؛ و(ج) شركة Twilio Inc. التي تعالج رقم جوال المستخدم حصرياً لإرسال رمز التحقق لمرة واحدة عبر تطبيق WhatsApp للتحقق من رقم جوال المستخدم.'
      },
      {
        heading: '8. ملفات تعريف الارتباط والتخزين المحلي',
        body: 'لا يُنشئ تطبيق Relationship ID أي ملفات تعريف ارتباط (Cookies) خاصة به. وللحفاظ على جلسة تسجيل الدخول، تستخدم خدمة Firebase Authentication التخزين المحلي للمتصفح عند تفعيل خيار "تذكر تسجيل دخولي"، أو تخزين الجلسة المؤقت عند إلغائه (مع الرجوع تلقائياً إلى الذاكرة المؤقتة في حال تعذر التخزين بالمتصفح). كما أننا لا نستخدم أي أدوات للتحليلات الإعلانية أو تتبع سلوك المستخدمين. ملفات تعريف الارتباط الوحيدة المستخدمة هي تلك الصادرة مباشرة عن خدمة Google reCAPTCHA Enterprise لأغراض الأمان ومكافحة إساءة الاستخدام الآلية، وتُعد ضرورية تماماً لتشغيل الخدمة.'
      },
      {
        heading: '9. حقوقك بصفتك صاحب بيانات',
        body: 'بموجب نظام حماية البيانات الشخصية في المملكة العربية السعودية (PDPL)، يحق لك: (أ) الحق في العلم بكيفية جمع بياناتك ومعالجتها؛ (ب) الحق في الوصول إلى بياناتك الشخصية وفي نقلها — يمكنك تنزيل نسخة من بياناتك بصيغة JSON قابلة للقراءة آلياً في أي وقت من قائمة الحساب في التطبيق عبر خيار "تنزيل بياناتي (JSON)"، كما يمكنك طلب نسخة عبر البريد الإلكتروني customerservices@relationshipid.org؛ (ج) الحق في تصحيح وتعديل الحقول المحمية في الملف التعريفي، والمتوفر مباشرة داخل التطبيق عبر تقديم طلب تعديل يتطلب موافقة الشريك؛ (د) الحق في إتلاف ومحو البيانات، المتوفر مباشرة داخل التطبيق من خلال خيار "حذف الحساب"؛ (هـ) الحق في الرجوع عن الموافقة في أي وقت، بما في ذلك إنهاء سجل العلاقة عبر التطبيق مما يلغي التحقق العام فوراً. لأي طلبات غير مؤتمتة داخل الواجهة، يرجى مراسلتنا على customerservices@relationshipid.org. كما يحق لك تقديم شكوى لدى الهيئة السعودية للبيانات والذكاء الاصطناعي (SDAIA) في حال رأيت أن معالجة بياناتك تخالف الأنظمة المرعية.'
      },
      {
        heading: '10. الأمان والإشعار بالانتهاكات',
        body: 'نطبق تدابير أمنية معتمدة وقابلة للتحقق، بما في ذلك إلزامية فحص Firebase App Check على كافة واجهات برمجة التطبيقات الحساسة، والتحقق المستند إلى الرموز المميزة للمصادقة، وضوابط الوصول المشددة. وفي حال وقوع أي حادث انتهاك للبيانات الشخصية قد يؤثر على أمان بيانات المستخدمين أو خصوصيتهم، فإننا نلتزم بإشعار الهيئة السعودية للبيانات والذكاء الاصطناعي (SDAIA) والأفراد المتأثرين وفقاً للمدد والإجراءات التي يحددها نظام حماية البيانات الشخصية.'
      },
      {
        heading: '11. بيانات القُصّر والأطفال',
        body: 'يقتصر استخدام Relationship ID على البالغين الذين أتموا 18 عاماً فما فوق. ولا نجمع أو نعالج أو نحتفظ عمداً بأي بيانات شخصية تعود لمن هم دون سن 18 عاماً. وفي حال تبين وجود حساب يخص قاصراً، فسيتم إنهاء الحساب وحذف كافة البيانات المرتبطة به فوراً.'
      },
      {
        heading: '12. تعديلات سياسة الخصوصية',
        body: 'تخضع هذه السياسة لإصدارات محددة (الإصدار الحالي: 2026-10-01). قد نحدث هذه السياسة بشكل دوري تلبيةً للمتطلبات التشغيلية أو التنظيمية. وسيُطلب من المستخدمين مراجعة الشروط المعدلة جوهرياً والموافقة عليها قبل الاستمرار في استخدام الخدمة.'
      }
    ],
    termsTitle: 'شروط الاستخدام',
    termsSections: [
      {
        heading: '1. عن المنصة',
        body: 'Relationship ID تسجّل علاقة بموافقة شخصين بالغين. تُوثَّق هذه العلاقة رقمياً برقم مرجعي وباركود.'
      },
      {
        heading: '2. استخدامك للمنصة',
        body: 'يجب أن يكون عمرك 18 عاماً أو أكثر. استخدم معلومات صحيحة، واحمِ حسابك، ولا ترسل دعوة دون علم الشريك وموافقته. يُمنع الاحتيال والإساءة وانتحال الشخصية وتجاوز الأمان.'
      },
      {
        heading: '3. عرض الشهادة',
        body: 'بموافقة الطرفين، يظهر اسماهما ومرحلة العلاقة وتاريخ بدايتها لمن يملك رابط الشهادة أو رمز QR. يمكن لأي طرف إنهاء العلاقة، وعندها يتوقف عرض الشهادة والتحقق منها فوراً.'
      },
      {
        heading: '4. الدعوات',
        body: 'لا تُسجّل العلاقة حتى يقبل الطرف الثاني. ويمكنه رفض الدعوة أو حظر المرسل.'
      },
      {
        heading: '5. إيقاف الحساب',
        body: 'قد نوقف أو نحذف الحساب أو سجل العلاقة دون إشعار عند مخالفة الشروط أو إساءة الاستخدام.'
      },
      {
        heading: '6. الملكية والبيانات',
        body: 'المنصة وتصميمها وشعارها ملك لـ Relationship ID . Org. بياناتك تبقى لك، وتسمح لنا باستخدامها لتشغيل الخدمة وعرض الشهادة بموافقتك.'
      },
      {
        heading: '7. توفر الخدمة',
        body: 'قد تحدث أخطاء أو انقطاعات. لا نضمن عمل الخدمة دائماً، ولا نتحمل الأضرار غير المباشرة بالقدر الذي يسمح به النظام.'
      },
      {
        heading: '8. حدود الشهادة',
        body: 'لا تمنح الشهادة حقوق زواج أو نفقة أو إرث أو هجرة أو إقامة، ولا تُنشئ التزامات مالية أو تسجيلاً حكومياً.'
      },
      {
        heading: '9. النزاعات',
        body: 'تطبق الأنظمة المعمول بها، وتنظر المحاكم المختصة في أي نزاع.'
      },
      {
        heading: '10. تحديث الشروط',
        body: 'الإصدار الحالي: 2026-10-10.\nاستمرار الاستخدام يعني قبول التحديثات، وسنطلب موافقتك مجدداً عند التغييرات المهمة.'
      },
      {
        heading: '11. التواصل',
        body: 'customerservices@relationshipid.org'
      }
    ]
  }
};
