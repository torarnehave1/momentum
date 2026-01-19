export const translations = {
  en: {
    app: {
      title: 'Vegvisr Momentum',
      badge: 'Early access'
    }
  },
  no: {
    app: {
      title: 'Vegvisr Momentum',
      badge: 'Tidlig tilgang'
    }
  },
  is: {
    app: {
      title: 'Vegvisr Momentum',
      badge: 'Snemma aðgangur'
    }
  },
  nl: {
    app: {
      title: 'Vegvisr Momentum',
      badge: 'Vroege toegang'
    }
  }
} as const;

export type TranslationKey = keyof typeof translations.en;
