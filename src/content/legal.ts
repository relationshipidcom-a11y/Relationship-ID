export const LEGAL_VERSION = '2026-10-01';

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
        body: 'The data controller responsible for personal data processed through Relationship ID is Ramy Gabriel, located in Al Fayha District, Riyadh 14253, Saudi Arabia. For any questions, data subject requests, or privacy inquiries, contact rami@relationshipid.org. Data subjects may use this email address to exercise their legal rights under applicable law.'
      },
      {
        heading: '2. What We Collect',
        body: 'We collect account and authentication data (email address and phone number), profile information (full legal names in Arabic and English, and optional social media handle), verification status, partner invitations, mutual relationship records, certificate identifiers, notifications, and security and audit logs. Date of birth is self-declared by users solely to verify that both participants are consenting adults aged 18 or older; date of birth is strictly confidential and is never shown on public certificates or shared with third parties.'
      },
      {
        heading: '3. How Long We Keep Data',
        body: 'Account and profile data is kept for as long as the account exists. A pending partner invitation expires 72 hours (3 days) after it is created and can no longer be accepted after that point. If invitations from the same sender are declined three times, a permanent block is recorded; only the recipient can remove that block, from within the app. When either partner ends a relationship record, or when a user deletes their account, the relationship record, the issued certificate, the public verification entry, the related invitations, change requests and notifications, and the contact reservations held for that record are all deleted, and public verification stops working immediately. Deleting an account additionally removes the account from Firebase Authentication together with the user profile document and that user\'s block list. Short-lived internal progress markers created during deletion are removed once deletion completes. Rate-limiting counters are held in server memory only and are never written to the database. We do not operate support-ticket, abuse-report or user activity log collections.'
      },
      {
        heading: '4. What Is Public',
        body: 'When a relationship certificate is issued upon mutual confirmation, the public verification page and QR code display only the following information to anyone possessing the certificate link or verification reference: the verified legal names of both partners, the relationship stage (Dating, Engaged, or Married), and the relationship start date. Contact details (email and phone number), date of birth, user identifiers, invitation records, and private security logs are never made public.'
      },
      {
        heading: '5. Lawful Basis for Processing',
        body: 'We process personal data on the following legal bases under the Saudi Personal Data Protection Law (PDPL): (a) Performance of a contract and service delivery requested by the user, including account registration, profile management, invitation dispatch, mutual record creation, and certificate issuance; (b) Explicit consent provided by both partners for creating the mutual relationship record and publicly displaying the verified certificate details; and (c) Legitimate interests in platform security, abuse prevention, rate limiting, and fraud prevention through App Check and server-side request validation.'
      },
      {
        heading: '6. Where Data Is Processed',
        body: 'Application data stored in Cloud Firestore is hosted in europe-west2 (London). Application server operations in server.ts are hosted in europe-west2 (London).\n\nFirebase Authentication is a global Google service holding account email addresses and phone numbers, and cannot be restricted to a single region, so those authentication identifiers may be processed outside Saudi Arabia and outside the United Kingdom across Google infrastructure.'
      },
      {
        heading: '7. Processors and Third Parties',
        body: 'We engage trusted processors to support our service: (a) Google LLC provides Firebase Authentication, Cloud Firestore, and Firebase App Check infrastructure; (b) Google reCAPTCHA Enterprise is utilized for App Check token verification to safeguard API endpoints against automated abuse and bots, which sets Google cookies strictly for abuse prevention; and (c) Twilio Inc. receives user phone numbers solely to transmit one-time verification passcodes for WhatsApp phone verification.'
      },
      {
        heading: '8. Cookies and Device Storage',
        body: 'Relationship ID sets no cookies of its own and uses no localStorage or sessionStorage in this application. We run no third-party analytics, behavioral tracking, or advertising networks. The only cookies utilized are those set directly by Google reCAPTCHA Enterprise for security and automated abuse detection, which are strictly necessary for service operation.'
      },
      {
        heading: '9. Your Rights as a Data Subject',
        body: 'Under the Saudi Personal Data Protection Law (PDPL), you have rights regarding your personal data: (a) Right to be informed about how your personal data is collected and processed; (b) Right of access and data portability — you can download a machine-readable JSON copy of your own data at any time from the account menu in the app, using "Download My Data (JSON)", and you may also request a copy by emailing rami@relationshipid.org; (c) Right to correction of protected profile fields, available directly in the application through mutual partner change requests; (d) Right to erasure (destruction of personal data), available directly in the application through the Delete Account feature; and (e) Right to withdraw consent at any time, including ending the relationship record through the application, which immediately revokes and removes public verification. For any requests not directly automated in the interface, contact rami@relationshipid.org. You also have the right to lodge a complaint with the Saudi Data & AI Authority (SDAIA) if you believe your personal data is being processed in violation of applicable laws.'
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
    termsTitle: 'Terms of Service',
    termsSections: [
      {
        heading: '1. Not an Official Registry or Legal Marriage',
        body: 'Relationship ID is a private digital record created only when two adults voluntarily confirm a relationship. It is not a government registry, marriage licence, court or notary service, legal contract, or proof of civil status. Relationship ID has no legal, civil, religious, or governmental standing.'
      },
      {
        heading: '2. Eligibility and User Conduct',
        body: 'You must be at least 18 years of age to register or use this platform. You agree to provide true, accurate, and current information, to safeguard your account credentials, and to initiate invitations only with the knowledge and mutual consent of the other person. Harassment, impersonation, identity theft, fraud, unlawful content, automated scraping, and any attempts to bypass authentication, phone verification, or security controls are strictly prohibited.'
      },
      {
        heading: '3. Public Display and Mutual Consent',
        body: 'By jointly creating and confirming a relationship record, both partners explicitly consent to the public display of both partners\' verified legal names, relationship stage (Dating, Engaged, or Married), and relationship start date to anyone holding the certificate link, verification reference, or QR code. Either partner may end the relationship record in the application at any time, which revokes public verification immediately.'
      },
      {
        heading: '4. Invitations and Blocking',
        body: 'An invitation sent by Partner 1 does not establish any record until voluntarily accepted by Partner 2. Partner 2 may decline an invitation at any time or block the inviter from sending further invitations using the in-app blocking feature.'
      },
      {
        heading: '5. Account Suspension and Termination',
        body: 'We reserve the right to suspend, terminate, or delete any account or relationship record immediately without prior notice upon: (a) breach of these Terms of Service; (b) impersonation or submission of fraudulent identity details; (c) harassment or abuse towards another individual; or (d) any attempt to tamper with API security, App Check, or verification controls.'
      },
      {
        heading: '6. Intellectual Property',
        body: 'The Relationship ID platform, source code, visual branding, certificate designs, trademarks, and associated software are the exclusive intellectual property of Ramy Gabriel. Users retain ownership of their personal information and grant Relationship ID the limited license necessary to operate the service and render certificates as directed.'
      },
      {
        heading: '7. Disclaimer of Warranties and Limitation of Liability',
        body: 'Relationship ID is provided on an "as is" and "as available" basis without warranties of any kind, whether express, implied, statutory, or otherwise, including warranties of merchantability, fitness for a particular purpose, or uninterrupted, error-free operation. To the fullest extent permitted by applicable law, the operator shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising out of your access to or use of the platform. Nothing in these terms excludes liability that cannot be excluded under applicable law.'
      },
      {
        heading: '8. No Legal or Governmental Effect',
        body: 'Nothing contained within this application, its certificates, or its verification portal creates a legal marriage, marital status, civil partnership, inheritance right, property entitlement, immigration or visa benefit, or official government record in the Kingdom of Saudi Arabia or any other jurisdiction.'
      },
      {
        heading: '9. Governing Law and Jurisdiction',
        body: 'These Terms of Service and any dispute or claim arising out of or related to them shall be governed by and construed in accordance with the laws and regulations of the Kingdom of Saudi Arabia. The competent judicial courts of the Kingdom of Saudi Arabia shall have exclusive jurisdiction over any disputes.'
      },
      {
        heading: '10. Versioning and Re-Acceptance',
        body: 'These terms are versioned (current version: 2026-10-01). Continued use of the platform following the publication of material modifications constitutes acceptance of the amended terms. When material changes occur, users will be prompted to re-accept the updated terms before proceeding.'
      },
      {
        heading: '11. Contact Information',
        body: 'For legal notices, terms questions, or inquiries regarding these Terms of Service, please contact rami@relationshipid.org.'
      }
    ]
  },
  ar: {
    privacyTitle: 'سياسة الخصوصية',
    privacySections: [
      {
        heading: '1. من نحن',
        body: 'الجهة المسؤولة والمتحكمة في معالجة البيانات الشخصية عبر منصة "Relationship ID" هو رامي جبرائيل (Ramy Gabriel)، المقيم في حي الفيحاء، الرياض 14253، المملكة العربية السعودية. لأي استفسارات أو ممارسة حقوق أصحاب البيانات الشخصية أو المسائل المتعلقة بالخصوصية، يمكنكم التواصل عبر البريد الإلكتروني: rami@relationshipid.org. يحق لأصحاب البيانات استخدام هذا العنوان لممارسة حقوقهم النظامية وفقاً للأنظمة المعمول بها.'
      },
      {
        heading: '2. ما نجمعه من بيانات',
        body: 'نقوم بجمع بيانات الحساب والمصادقة (عنوان البريد الإلكتروني ورقم الهاتف)، وبيانات الملف التعريفي (الأسماء القانونية الكاملة باللغتين العربية والإنجليزية، واسم المستخدم الاختياري لشبكات التواصل)، وحالة التحقق، والدعوات، وسجلات العلاقات المشتركة، ومعرفات الشهادات، والإشعارات، وسجلات الأمان والتدقيق. يُصرّح المستخدمون بتاريخ الميلاد ذاتياً فقط للتحقق من الأهلية النظامية بأن كِلا الطرفين بالغين (18 عاماً فأكثر)؛ ويُعد تاريخ الميلاد سرياً تماماً ولا يُعرض على الإطلاق في الشهادات العامة ولا يُشارك مع أي أطراف ثالثة.'
      },
      {
        heading: '3. مدة الاحتفاظ بالبيانات',
        body: 'يُحتفظ ببيانات الحساب والملف التعريفي طوال مدة وجود الحساب. وتنتهي صلاحية دعوة الشريك المعلقة بعد 72 ساعة (ثلاثة أيام) من إنشائها، ولا يمكن قبولها بعد ذلك. وإذا رُفضت دعوات المرسل نفسه ثلاث مرات، يُسجَّل حظر دائم، ولا يمكن إلغاء هذا الحظر إلا من قِبل الطرف المستقبل للدعوة من داخل التطبيق. وعند إنهاء أي من الشريكين لسجل العلاقة، أو عند حذف المستخدم لحسابه، تُحذف نهائياً سجل العلاقة والشهادة الصادرة ومدخل التحقق العام والدعوات وطلبات التعديل والإشعارات المرتبطة بالسجل وحجوزات بيانات الاتصال الخاصة به، ويتوقف التحقق العام عن العمل فوراً. ويؤدي حذف الحساب كذلك إلى إزالة الحساب من خدمة Firebase Authentication مع وثيقة الملف التعريفي وقائمة الحظر الخاصة بذلك المستخدم. وتُحذف المؤشرات الداخلية المؤقتة الخاصة بتتبع عملية الحذف بمجرد اكتمالها. أما عدّادات تحديد معدل الطلبات فتُحفظ في ذاكرة الخادم فقط ولا تُكتب في قاعدة البيانات مطلقاً. ولا نشغّل أي مجموعات لتذاكر الدعم أو بلاغات الإساءة أو سجلات نشاط المستخدمين.'
      },
      {
        heading: '4. ما يُعرض علناً للعموم',
        body: 'عند إصدار شهادة العلاقة بناءً على التأكيد المتبادل بين الطرفين، فإن بوابة التحقق العامة ورمز الاستجابة السريعة (QR) يعرضان فقط البيانات التالية لأي شخص لديه رابط الشهادة أو مرجع التحقق: الاسمان القانونيان المعتمدان لكِلا الشريكين، ومرحلة العلاقة (تعارف، خطوبة، أو زواج)، وتاريخ بدء العلاقة. أما بيانات الاتصال (البريد الإلكتروني ورقم الهاتف)، وتاريخ الميلاد، والمعرفات الداخلية للحسابات، وسجلات الدعوات، وسجلات الأمان الخاصة، فلا يتم إظهارها علناً على الإطلاق.'
      },
      {
        heading: '5. المسوغ النظامي للمعالجة',
        body: 'تتم معالجة البيانات الشخصية استناداً إلى المسوغات النظامية المقررة بموجب نظام حماية البيانات الشخصية في المملكة العربية السعودية: (أ) تنفيذ العقد وتقديم الخدمة التي طلبها المستخدم، بما في ذلك إنشاء الحساب، وإدارة الملف، وإرسال الدعوات، وإنشاء السجل المشترك، وإصدار الشهادة؛ (ب) الموافقة الصريحة الممنوحة من كِلا الشريكين لإنشاء سجل العلاقة المشترك وعرض بيانات الشهادة المعتمدة علناً للتحقق؛ (ج) المصلحة المشروعة في حفظ أمن المنصة، ومنع إساءة الاستخدام، والحد من المعدلات المشبوهة، ومكافحة الاحتيال من خلال خدمة App Check والتحقق البرمجي على الخادم.'
      },
      {
        heading: '6. أين تتم معالجة البيانات',
        body: 'يتم استضافة بيانات التطبيق المخزنة في قاعدة Cloud Firestore في منطقة europe-west2 (لندن). وتتم استضافة عمليات خادم التطبيق (server.ts) في منطقة europe-west2 (لندن).\n\nتُعد خدمة Firebase Authentication خدمة عالمية تابعة لشركة Google وتتولى حفظ عناوين البريد الإلكتروني وأرقام الهواتف الخاصة بالحسابات، ولا يمكن تقييدها بمنطقة جغرافية واحدة، ولذا فقد تتم معالجة تلك المعرفات الخاصة بالمصادقة خارج المملكة العربية السعودية وخارج المملكة المتحدة عبر البنية التحتية لشركة Google.'
      },
      {
        heading: '7. معالجو البيانات والأطراف الثالثة',
        body: 'نستعين بجهات معالجة موثوقة لتقديم خدماتنا: (أ) شركة Google LLC التي تقدم البنية التحتية لكل من Firebase Authentication وCloud Firestore وFirebase App Check؛ (ب) خدمة Google reCAPTCHA Enterprise المستخدمة للتحقق من أمان App Check لحماية واجهات البرمجة من البرمجيات الخبيثة والروبوتات، وتقوم بتعيين ملفات تعريف ارتباط (Cookies) خاصة بشركة Google للأغراض الأمنية فقط؛ و(ج) شركة Twilio Inc. التي تستلم رقم هاتف المستخدم حصرياً لإرسال رمز التحقق لمرة واحدة عبر تطبيق WhatsApp.'
      },
      {
        heading: '8. ملفات تعريف الارتباط والتخزين المحلي',
        body: 'لا يُنشئ تطبيق Relationship ID أي ملفات تعريف ارتباط (Cookies) خاصة به، ولا يستخدم التخزين المحلي (localStorage) أو تخزين الجلسة (sessionStorage) في هذا التطبيق. كما أننا لا نستخدم أي أدوات للتحليلات الإعلانية أو تتبع سلوك المستخدمين. ملفات تعريف الارتباط الوحيدة المستخدمة هي تلك الصادرة مباشرة عن خدمة Google reCAPTCHA Enterprise لأغراض الأمان ومكافحة إساءة الاستخدام الآلية، وتُعد ضرورية تماماً لتشغيل الخدمة.'
      },
      {
        heading: '9. حقوقك بصفتك صاحب بيانات',
        body: 'بموجب نظام حماية البيانات الشخصية في المملكة العربية السعودية (PDPL)، يحق لك: (أ) الحق في العلم بكيفية جمع بياناتك ومعالجتها؛ (ب) الحق في الوصول إلى بياناتك الشخصية وفي نقلها — يمكنك تنزيل نسخة من بياناتك بصيغة JSON قابلة للقراءة آلياً في أي وقت من قائمة الحساب في التطبيق عبر خيار "تنزيل بياناتي (JSON)"، كما يمكنك طلب نسخة عبر البريد الإلكتروني rami@relationshipid.org؛ (ج) الحق في تصحيح وتعديل الحقول المحمية في الملف التعريفي، والمتوفر مباشرة داخل التطبيق عبر تقديم طلب تعديل يتطلب موافقة الشريك؛ (د) الحق في إتلاف ومحو البيانات، المتوفر مباشرة داخل التطبيق من خلال خيار "حذف الحساب"؛ (هـ) الحق في الرجوع عن الموافقة في أي وقت، بما في ذلك إنهاء سجل العلاقة عبر التطبيق مما يلغي التحقق العام فوراً. لأي طلبات غير مؤتمتة داخل الواجهة، يرجى مراسلتنا على rami@relationshipid.org. كما يحق لك تقديم شكوى لدى الهيئة السعودية للبيانات والذكاء الاصطناعي (SDAIA) في حال رأيت أن معالجة بياناتك تخالف الأنظمة المرعية.'
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
        heading: '1. ليست سجلاً حكومياً ولا عقد زواج رسمي',
        body: 'تُعد منصة "Relationship ID" سجلاً رقمياً خاصاً يُنشأ حصرياً بناءً على التأكيد الطوعي والمتبادل بين شخصين بالغين. وهذه المنصة ليست سجلاً حكومياً، ولا عقد أو ترخيص زواج رسمي، ولا وثيقة كاتب عدل أو جهة قضائية، ولا تُعد دليلاً على الحالة المدنية، وليس لها أي صفة أو أثر نظامي أو رسمي أو قضائي.'
      },
      {
        heading: '2. الأهلية وسلوك المستخدم',
        body: 'يجب ألا يقل عمر المستخدم عن 18 عاماً للتسجيل في المنصة. ويلتزم المستخدم بتقديم معلومات دقيقة وصحيحة، والحفاظ على سرية حسابه، وعدم إرسال دعوات إلا بعلم الشريك وموافقته الصريحة. ويُحظر تماماً انتحال الشخصية، أو تقديم بيانات مضللة، أو التحرش، أو الاحتيال، أو نشر محتوى غير مشروع، أو محاولة تجاوز أنظمة المصادقة أو التحقق من الهاتف أو آليات الأمان البرمجية.'
      },
      {
        heading: '3. الموافقة على العرض العام والإنهاء الفوري',
        body: 'بإنشاء سجل العلاقة وتأكيده بشكل مشترك، يمنح كِلا الشريكين موافقتهما الصريحة على العرض العام للاسمين القانونيين، ومرحلة العلاقة (تعارف، خطوبة، زواج)، وتاريخ البدء لكل من يملك رابط الشهادة أو رمز التحقق (QR). ويحق لأي من الشريكين إنهاء العلاقة عبر التطبيق في أي وقت، مما يؤدي فوراً إلى إلغاء التحقق العام وسحب الشهادة علناً.'
      },
      {
        heading: '4. الدعوات وخيار الحظر',
        body: 'لا ترتب الدعوة المرسلة من الشريك الأول أي أثر ما لم يقبلها الشريك الثاني طوعاً. ويحق للشريك الثاني رفض الدعوة أو حظر المرسل من إرسال أي دعوات مستقبلية باستخدام ميزة الحظر المتاحة في التطبيق.'
      },
      {
        heading: '5. تعليق الحساب والإنهاء',
        body: 'نحتفظ بالحق في تعليق أو إنهاء أو حذف أي حساب أو سجل علاقة فوراً ودون إشعار مسبق في الحالات التالية: (أ) مخالفة شروط الاستخدام؛ (ب) انتحال الشخصية أو تزوير البيانات؛ (ج) ممارسة الإساءة أو التحرش تجاه أي شخص؛ (د) محاولة العبث بأنظمة الأمان البرمجية أو واجهات App Check أو تجاوز التحقق.'
      },
      {
        heading: '6. الملكية الفكرية',
        body: 'تعتبر منصة Relationship ID ورموزها البرمجية وتصميم الشهادات والهوية البصرية والعلامات التجارية ملكية فكرية حصرية لـ رامي جبرائيل (Ramy Gabriel). ويحتفظ المستخدمون ببياناتهم الشخصية ويمنحون المنصة ترخيصاً محدوداً لتشغيل الخدمة وعرض الشهادات وفقاً لإرادتهم.'
      },
      {
        heading: '7. إخلاء المسؤولية وحدودها',
        body: 'تُقدّم المنصة "كما هي" و"حسب توفرها" دون أي ضمانات صريحة أو ضمنية أو نظامية، بما في ذلك ضمانات الملاءمة لغرض معين أو الاستمرار دون انقطاع أو خلوها من الأخطاء البرمجية. ولا يتحمل مشغل المنصة أي مسؤولية عن أي أضرار غير مباشرة أو تبعية أو عرضية ناتجة عن استخدام المنصة، وذلك إلى أقصى حد يسمح به النظام المعمول به.'
      },
      {
        heading: '8. نفي أي أثر قانوني أو حكومي',
        body: 'لا ينشأ عن استخدام هذا التطبيق أو الشهادات الصادرة عنه أي عقد زواج شرعي أو نظامي، أو مركز مدني، أو حقوق نفقة أو إرث، أو التزامات مالية، أو مزايا هجرة وإقامة، أو أي قيود في السجلات الحكومية الرسمية في المملكة العربية السعودية أو أي دولة أخرى.'
      },
      {
        heading: '9. النظام الواجب التطبيق والاختصاص القضائي',
        body: 'تخضع شروط الاستخدام هذه ويُفسّر أي نزاع ينشأ عنها وفقاً للأنظمة واللوائح المعمول بها في المملكة العربية السعودية، وتختص المحاكم القضائية المختصة في المملكة العربية السعودية حصرياً بنظر أي نزاع.'
      },
      {
        heading: '10. تعديل الشروط والموافقة المتجددة',
        body: 'شروط الاستخدام هذه مرقمة بإصدار معتمد (الإصدار الحالي: 2026-10-01). إن استمرارك في استخدام المنصة بعد نشر أي تعديلات جوهرية يعد موافقة منك عليها. وفي حال إجراء تعديلات جوهرية، سيُطلب من المستخدمين إعادة الموافقة على الشروط المحدثة قبل متابعة الاستخدام.'
      },
      {
        heading: '11. التواصل',
        body: 'لأي إشعارات قانونية أو استفسارات تتعلق بشروط الاستخدام، يُرجى التواصل معنا عبر البريد الإلكتروني: rami@relationshipid.org.'
      }
    ]
  }
};
