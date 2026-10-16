import { ScreenId, Language } from '../types';

const CANONICAL_ORIGIN = 'https://www.relationshipid.org';

interface SeoConfig {
  title: { ar: string; en: string };
  description: { ar: string; en: string };
  canonicalPath?: string;
  robots: string;
}

const SEO_MAP: Record<ScreenId, SeoConfig> = {
  auth: {
    title: {
      ar: 'Relationship ID - سجل علاقة خاص وتوثيق رقمي متبادل',
      en: 'Relationship ID - Private Relationship Record Registry'
    },
    description: {
      ar: 'سجل رقمي خاص للعلاقات بموافقة متبادلة وتوثيق آمن دون طلب بطاقات هوية.',
      en: 'Private relationship registry with mutual partner consent, secure invitations, and privacy-safe certificate verification.'
    },
    canonicalPath: '/',
    robots: 'index, follow'
  },
  about: {
    title: {
      ar: 'عن المنصة ومعايير التوثيق والسجل - Relationship ID',
      en: 'About Relationship ID - Registry Standards & Verification Scope'
    },
    description: {
      ar: 'تعرف على طبيعة منصة Relationship ID كسجل إقرار طوعي متبادل، ونطاق التحقق، وإرشادات مكافحة الإساءة.',
      en: 'Learn about Relationship ID as a voluntary mutual declaration registry, verification scope, and anti-abuse guidance.'
    },
    canonicalPath: '/about',
    robots: 'index, follow'
  },
  privacy: {
    title: {
      ar: 'سياسة الخصوصية - Relationship ID',
      en: 'Privacy Policy - Relationship ID'
    },
    description: {
      ar: 'سياسة الخصوصية لمنصة Relationship ID وحماية البيانات الشخصية وفق الأنظمة المرعية.',
      en: 'Privacy Policy for Relationship ID, detailing personal data processing, rights under PDPL, and security measures.'
    },
    canonicalPath: '/privacy',
    robots: 'index, follow'
  },
  terms: {
    title: {
      ar: 'شروط الاستخدام - Relationship ID',
      en: 'Terms of Use - Relationship ID'
    },
    description: {
      ar: 'شروط وأحكام استخدام منصة Relationship ID وحقوق وواجبات المستخدمين وحدود الشهادة الرقمية.',
      en: 'Terms of Use for Relationship ID, user commitments, certificate limits, and service conditions.'
    },
    canonicalPath: '/terms',
    robots: 'index, follow'
  },
  // Private workflow screens - strictly protected from indexing, no public canonical assigned
  p1_details: {
    title: { ar: 'بيانات الشريك الأول - Relationship ID', en: 'Partner 1 Details - Relationship ID' },
    description: { ar: 'تسجيل بيانات الشريك الأول داخل السجل.', en: 'Partner 1 registry entry.' },
    robots: 'noindex, nofollow'
  },
  p1_invite_create: {
    title: { ar: 'إرسال دعوة الشريك - Relationship ID', en: 'Send Partner Invitation - Relationship ID' },
    description: { ar: 'إرسال دعوة الشريك لإتمام السجل المتبادل.', en: 'Send invitation for mutual relationship record.' },
    robots: 'noindex, nofollow'
  },
  invite_success: {
    title: { ar: 'تم إرسال الدعوة - Relationship ID', en: 'Invitation Sent - Relationship ID' },
    description: { ar: 'تم إرسال دعوة الشريك بنجاح.', en: 'Partner invitation sent successfully.' },
    robots: 'noindex, nofollow'
  },
  p1_waiting: {
    title: { ar: 'بانتظار موافقة الشريك - Relationship ID', en: 'Awaiting Partner Acceptance - Relationship ID' },
    description: { ar: 'بانتظار قبول الشريك للدعوة المشتركة.', en: 'Awaiting partner response to mutual invitation.' },
    robots: 'noindex, nofollow'
  },
  p2_landing: {
    title: { ar: 'دعوة للانضمام إلى سجل العلاقة - Relationship ID', en: 'Relationship Invitation - Relationship ID' },
    description: { ar: 'دعوة خاصة لإتمام توثيق سجل العلاقة المشترك.', en: 'Private invitation to join mutual relationship record.' },
    robots: 'noindex, nofollow'
  },
  p2_auth: {
    title: { ar: 'تسجيل الدخول لقبول الدعوة - Relationship ID', en: 'Sign In to Accept - Relationship ID' },
    description: { ar: 'تسجيل الدخول للموافقة على الدعوة المشتركة.', en: 'Sign in to accept mutual relationship invitation.' },
    robots: 'noindex, nofollow'
  },
  p2_details: {
    title: { ar: 'بيانات الشريك الثاني - Relationship ID', en: 'Partner 2 Details - Relationship ID' },
    description: { ar: 'إكمال بيانات الشريك الثاني وتأكيد الموافقة.', en: 'Partner 2 details and consent confirmation.' },
    robots: 'noindex, nofollow'
  },
  review_controls: {
    title: { ar: 'مراجعة وتعديل بيانات السجل - Relationship ID', en: 'Review Registry Record - Relationship ID' },
    description: { ar: 'مراجعة وتعديل بيانات السجل وإعدادات الخصوصية.', en: 'Review relationship record and privacy settings.' },
    robots: 'noindex, nofollow'
  },
  official_certificate: {
    title: { ar: 'شهادة سجل العلاقة الرقمية - Relationship ID', en: 'Official Relationship Certificate - Relationship ID' },
    description: { ar: 'عرض شهادة سجل العلاقة الرقمية الموثقة.', en: 'View official digital relationship certificate.' },
    robots: 'noindex, nofollow'
  },
  verify_portal: {
    title: { ar: 'بوابة التحقق من السجل - Relationship ID', en: 'Verification Portal - Relationship ID' },
    description: { ar: 'بوابة التحقق المباشر من صحة سجل العلاقة.', en: 'Direct registry verification portal.' },
    robots: 'noindex, nofollow'
  },
  not_found: {
    title: { ar: 'الصفحة غير موجودة - Relationship ID', en: 'Page Not Found - Relationship ID' },
    description: { ar: 'الصفحة المطلوبة غير موجودة.', en: 'The requested page was not found.' },
    robots: 'noindex, nofollow'
  }
};

export function updateSeoMetadata(screen: ScreenId, language: Language): void {
  if (typeof document === 'undefined') return;

  const config = SEO_MAP[screen] || SEO_MAP.auth;
  const title = config.title[language] || config.title.en;
  const description = config.description[language] || config.description.en;

  // 1. Document title
  document.title = title;

  // 2. Meta description
  let descMeta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
  if (!descMeta) {
    descMeta = document.createElement('meta');
    descMeta.setAttribute('name', 'description');
    document.head.appendChild(descMeta);
  }
  descMeta.setAttribute('content', description);

  // 3. Robots meta tag
  let robotsMeta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
  if (!robotsMeta) {
    robotsMeta = document.createElement('meta');
    robotsMeta.setAttribute('name', 'robots');
    document.head.appendChild(robotsMeta);
  }
  robotsMeta.setAttribute('content', config.robots);

  // 4. Canonical link tag
  let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (config.canonicalPath) {
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', `${CANONICAL_ORIGIN}${config.canonicalPath}`);
  } else if (canonicalLink) {
    // Remove canonical link for private/token-bearing routes to avoid canonical leakage
    canonicalLink.remove();
  }

  // 5. OpenGraph & Twitter tags
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', title);
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', description);
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) {
    if (config.canonicalPath) {
      ogUrl.setAttribute('content', `${CANONICAL_ORIGIN}${config.canonicalPath}`);
    } else {
      ogUrl.remove();
    }
  }

  // 6. Language and direction on html tag
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
}
